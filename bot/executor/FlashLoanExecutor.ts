import { Contract, ContractTransactionReceipt, ethers } from "ethers";

export interface GasConfig {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
}

/** Result returned by executeFlashLoan for convenient callers (watchAndExecute, runBot). */
export interface FlashLoanResult {
    success: boolean;
    txHash?: string;
    netProfitUSD?: number;
    actualProfitRaw?: bigint;
    gasUsed?: bigint;
    gasCostWei?: bigint;
    profitVerified?: boolean;
    error?: string;
}

const ENGINE_EVENTS = new ethers.Interface([
    "event ArbitrageFinished(uint256 profit)"
]);

// Mirrors contracts/v2/libraries/Errors.sol so reverts surface as
// "DeadlineExpired" etc. instead of "execution reverted (unknown custom error)".
const ENGINE_ERRORS = new ethers.Interface([
    "error Unauthorized()",
    "error InvalidAddress()",
    "error InvalidAmount()",
    "error InvalidRoute()",
    "error InvalidAdapter()",
    "error RepaymentFailed()",
    "error InsufficientProfit()",
    "error ZeroOutput()",
    "error InvalidSlippage()",
    "error RescueFailed()",
    "error DeadlineExpired()",
    "error InvalidToken()",
    "error InsufficientBalance()",
    "error InProgress()",
    "error InvalidState()"
]);

export function decodeEngineError(e: any): string | null {
    const candidates = [e?.data, e?.error?.data, e?.info?.error?.data];
    for (const data of candidates) {
        if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) continue;
        try {
            const parsed = ENGINE_ERRORS.parseError(data);
            if (parsed) return parsed.name;
        } catch {
            // Not an engine custom error.
        }
    }
    return null;
}

/**
 * SwapStep as expected by the deployed ArbitrageEngineV2 route struct:
 * (address adapter, address tokenIn, address tokenOut, uint24 fee,
 *  uint256 amountIn, uint256 minAmountOut, bytes data, uint256 deadline)
 */
export interface SwapStep {
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    fee: number | bigint;
    amountIn: bigint;
    minAmountOut: bigint;
    data: string;
    deadline: number | bigint;
}

/**
 * Route as expected by executeArbitrage(token, amount, route):
 * { swaps: SwapStep[], profitToken, minProfit }
 */
export interface Route {
    swaps: SwapStep[];
    profitToken: string;
    minProfit: bigint;
}

/** Given opportunity objects produced by the scanner (may carry `route` or flat `steps`), build a Route. */
function normalizeRoute(opp: any): Route {
    // Modern format: opp.route = { swaps, profitToken, minProfit }
    if (opp?.route && Array.isArray(opp.route.swaps) && opp.route.profitToken) {
        return {
            swaps: opp.route.swaps,
            profitToken: opp.route.profitToken,
            minProfit: BigInt(opp.route.minProfit ?? 0)
        };
    }

    // Legacy flat format: opp.steps = [{ adapter, tokenIn, tokenOut, fee, amountIn, amountOut, dex, ... }]
    if (opp?.steps && Array.isArray(opp.steps) && opp.steps.length > 0) {
        const profitToken = opp.route?.profitToken || opp.profitToken || opp.steps[opp.steps.length - 1]?.to || opp.steps[opp.steps.length - 1]?.tokenOut;
        const lastStep = opp.steps[opp.steps.length - 1];
        const inputIsProfitToken =
            profitToken.toLowerCase() === String(opp?.steps?.[0]?.from || opp?.steps?.[0]?.tokenIn || "").toLowerCase();

        if (opp.steps[0]?.amountIn === undefined && opp.steps[0]?.amount === undefined) {
            throw new Error("FlashLoanExecutor: first legacy step missing amountIn/amount");
        }

        const swaps: SwapStep[] = opp.steps.map((s: any) => ({
            adapter: s.adapter || s.dex, // legacy: `dex` is the adapter name; resolved later
            tokenIn: s.tokenIn || s.from,
            tokenOut: s.tokenOut || s.to,
            fee: Number(s.fee ?? 0),
            // 0 = engine fills in the previous leg's output; avoids BigInt(undefined).
            amountIn: BigInt(s.amountIn ?? s.amount ?? 0),
            minAmountOut: BigInt(s.minAmountOut ?? s.amountOut ?? 0),
            data: s.data || "0x",
            deadline: Number(s.deadline ?? (Math.floor(Date.now() / 1000) + 300))
        }));

        return {
            swaps,
            profitToken,
            minProfit: BigInt(opp.profit ?? 0)
        };
    }

    throw new Error("FlashLoanExecutor: unsupported opportunity shape (no route.swaps or steps)");
}

/**
 * Executes a cross-DEX arbitrage route through the deployed ArbitrageEngineV2
 * using a Morpho flash loan.
 *
 * Engine ABI: executeArbitrage(address token, uint256 amount, Route route)
 * where Route = { SwapStep[] swaps, address profitToken, uint256 minProfit }
 */
export class FlashLoanExecutor {

    constructor(
        private readonly engine: Contract,
        /** Optional registry used to resolve DEX names → adapter addresses. */
        private readonly registry?: any
    ) {}

    async validateOpportunity(opp: any, token?: string): Promise<boolean> {
        const route = this.resolveRoute(normalizeRoute(opp));
        const tokenIn = token || route.profitToken || route.swaps[0]?.tokenIn;
        if (!tokenIn || !this.engine.validateRoute) return false;
        if (route.swaps.length < 2 ||
            route.swaps[0].tokenIn.toLowerCase() !== tokenIn.toLowerCase() ||
            route.swaps[route.swaps.length - 1].tokenOut.toLowerCase() !== tokenIn.toLowerCase() ||
            route.profitToken.toLowerCase() !== tokenIn.toLowerCase()) {
            return false;
        }
        return Boolean(await this.engine.validateRoute(route, tokenIn));
    }

    async estimateOpportunityGas(opp: any, token?: string): Promise<bigint> {
        const route = this.resolveRoute(normalizeRoute(opp));
        const tokenIn = token || route.profitToken || route.swaps[0]?.tokenIn;
        const amountIn = route.swaps[0]?.amountIn;
        if (!tokenIn || amountIn === undefined) throw new Error("Missing route input for gas estimation");
        if (route.swaps.length < 2 ||
            route.swaps[0].tokenIn.toLowerCase() !== tokenIn.toLowerCase() ||
            route.swaps[route.swaps.length - 1].tokenOut.toLowerCase() !== tokenIn.toLowerCase() ||
            route.profitToken.toLowerCase() !== tokenIn.toLowerCase()) {
            throw new Error("Route is not a closed cycle");
        }
        return this.engine.executeArbitrage.estimateGas(tokenIn, amountIn, route);
    }

    private async getDynamicGasPrice(provider: any): Promise<GasConfig> {
        if (!provider?.getFeeData) {
            console.warn("No provider available for gas pricing, using defaults");
            return {
                maxFeePerGas: ethers.parseUnits("2", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
            };
        }
        try {
            const feeData = await provider.getFeeData();

            // For EIP-1559 networks (like Base)
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                // Add 20% buffer to ensure transaction goes through
                const maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
                const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;

                return {
                    maxFeePerGas,
                    maxPriorityFeePerGas
                };
            }

            // Fallback to legacy gas price
            if (feeData.gasPrice) {
                const gasPrice = (feeData.gasPrice * 120n) / 100n;
                return {
                    maxFeePerGas: gasPrice,
                    maxPriorityFeePerGas: gasPrice
                };
            }

            // Ultimate fallback — Base gas is very low; 2 gwei wastes budget.
            return {
                maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei")
            };
        } catch (error) {
            console.error("Failed to get dynamic gas price, using defaults:", error);
            return {
                maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei")
            };
        }
    }

    /** Resolve a DEX name to an adapter address via the optional registry. */
    private resolveAdapter(adapterOrDex: string): string {
        if (!this.registry) return adapterOrDex;
        try {
            // If the value is an address (0x…), use as-is; otherwise treat as DEX name.
            return /^0x[a-fA-F0-9]{40}$/.test(adapterOrDex)
                ? adapterOrDex
                : this.registry.get(adapterOrDex);
        } catch {
            return adapterOrDex;
        }
    }

    /** Map route.swaps: replace DEX names with adapter addresses when a registry is present. */
    private resolveRoute(route: Route): Route {
        return {
            ...route,
            swaps: route.swaps.map(s => ({ ...s, adapter: this.resolveAdapter(s.adapter) }))
        };
    }

    /**
     * High-level convenience: takes an opportunity object (modern `route` or legacy `steps`)
     * and executes it. Returns a friendly result instead of throwing.
     */
    async executeFlashLoan(opp: any, token?: string): Promise<FlashLoanResult> {
        try {
            const route = normalizeRoute(opp);
            if (route.swaps.length < 2) {
                return { success: false, error: "Flash loan requires at least 2 cross-DEX swaps (arbitrage needs a round trip)." };
            }
            const resolved = this.resolveRoute(route);

            const tokenIn = token || route.swaps[0].tokenIn;
            const amountIn = route.swaps[0].amountIn;

            const receipt = await this.execute(tokenIn, amountIn, resolved);
            let actualProfitRaw: bigint | undefined;
            for (const log of receipt.logs ?? []) {
                try {
                    if (String(log.address).toLowerCase() !== String(this.engine.target).toLowerCase()) {
                        continue;
                    }
                    const parsed = ENGINE_EVENTS.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "ArbitrageFinished") {
                        actualProfitRaw = BigInt(parsed.args.profit);
                        break;
                    }
                } catch {
                    // Ignore logs emitted by adapters/tokens.
                }
            }
            const gasUsed = receipt.gasUsed;
            const gasCostWei = gasUsed * (receipt.gasPrice ?? 0n);
            if (actualProfitRaw === undefined) {
                console.warn("ArbitrageFinished event not found; actual profit could not be verified");
            }
            return {
                success: true,
                txHash: receipt.hash,
                // Net profit is token-amount based; caller may refine USD value.
                netProfitUSD: typeof opp?.netProfitUSD === "number"
                    ? opp.netProfitUSD
                    : Number(route.minProfit || 0n) / 1e6,
                actualProfitRaw,
                gasUsed,
                gasCostWei,
                profitVerified: actualProfitRaw !== undefined
            };
        } catch (e: any) {
            return { success: false, error: e?.message || String(e) };
        }
    }

    /**
     * Execute a flash-loan arbitrage.
     * @param token  the token flashed (typically the profit token / asset)
     * @param amount the flash amount in raw units
     * @param route  the route object: { swaps: SwapStep[], profitToken, minProfit }
     */
    async execute(
        token: string,
        amount: bigint,
        route: any,
        customGasConfig?: GasConfig
    ): Promise<ContractTransactionReceipt> {

        console.log();
        console.log("====================================");
        console.log("EXECUTING FLASH LOAN");
        console.log("====================================");

        try {
            // Get dynamic gas pricing
            const gasConfig = customGasConfig || await this.getDynamicGasPrice(this.engine.runner?.provider);

            console.log("Gas Config:");
            console.log("Max Fee Per Gas:", ethers.formatUnits(gasConfig.maxFeePerGas || 0n, "gwei"), "gwei");
            console.log("Max Priority Fee:", ethers.formatUnits(gasConfig.maxPriorityFeePerGas || 0n, "gwei"), "gwei");

            // Estimate gas for the transaction (non-fatal if estimation fails)
            let gasLimit: bigint;
            try {
                gasLimit = await this.engine.executeArbitrage.estimateGas(
                    token,
                    amount,
                    route
                );
                // Add 20% buffer to gas limit
                gasLimit = (gasLimit * 120n) / 100n;
                console.log("Estimated Gas Limit:", gasLimit.toString());
            } catch (estimateError) {
                if (process.env.ALLOW_GAS_ESTIMATE_FALLBACK === "true") {
                    console.warn("Gas estimation failed, using configured fallback limit:", estimateError);
                    gasLimit = 650000n;
                } else {
                    const decoded = decodeEngineError(estimateError);
                    const reason = estimateError instanceof Error ? estimateError.message : String(estimateError);
                    throw new Error(`Gas estimation failed; refusing execution: ${decoded ? `revert ${decoded}() — ` : ""}${reason}`);
                }
            }

            // Execute transaction with dynamic gas settings
            const tx = await this.engine.executeArbitrage(
                token,
                amount,
                route,
                {
                    maxFeePerGas: gasConfig.maxFeePerGas,
                    maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
                    gasLimit: gasConfig.gasLimit || gasLimit
                }
            );

            console.log("Tx:", tx.hash);
            console.log("Waiting for confirmation...");

            const receipt = await tx.wait();

            if (!receipt || receipt.status !== 1) {
                throw new Error("Flash loan transaction reverted.");
            }

            console.log("Gas Used :", receipt.gasUsed.toString());
            console.log("Effective Gas Price:", receipt.gasPrice ? ethers.formatUnits(receipt.gasPrice, "gwei") + " gwei" : "N/A");
            console.log("Block    :", receipt.blockNumber);
            console.log("Gas Cost  :", ethers.formatEther((receipt.gasUsed || 0n) * (receipt.gasPrice || 0n)), "ETH");

            return receipt;
        } catch (error: any) {
            const decoded = decodeEngineError(error);
            const message = error?.message || String(error);
            console.error("Transaction execution failed:", decoded ? `${decoded}(): ${message}` : message);

            if (decoded) {
                throw new Error(`Flash loan reverted: ${decoded}()`);
            }

            if (message.includes("insufficient funds")) {
                throw new Error("Insufficient funds for gas + value");
            }
            if (message.includes("nonce")) {
                throw new Error("Nonce error - transaction with same nonce already pending");
            }

            throw error;
        }
    }
}
