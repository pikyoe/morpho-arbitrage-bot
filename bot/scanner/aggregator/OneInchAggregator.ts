import { QuoteRequest, QuoteResult } from "../quote/index.js";
import { oneInchRateLimiter } from "../../utils/RateLimiter.js";

interface OneInchQuoteResponse {
    fromToken: {
        symbol: string;
        name: string;
        decimals: number;
        address: string;
    };
    toToken: {
        symbol: string;
        name: string;
        decimals: number;
        address: string;
    };
    // v6.x quote responses report the expected output as dstAmount.
    // toTokenAmount/toAmount are kept for older API versions.
    dstAmount?: string | number;
    toTokenAmount?: string | number;
    toAmount?: string | number;
    fromTokenAmount?: string | number;
    srcAmount?: string | number;
    error?: {
        description?: string;
        message?: string;
    };
}

export function parseOneInchQuoteResponse(data: any): { amountOut: bigint } | null {
    if (!data || typeof data !== "object") {
        return null;
    }

    const errorDescription = data.error?.description || data.error?.message || data.description || data.message;
    if (errorDescription) {
        return null;
    }

    const rawAmount = data.dstAmount ?? data.toTokenAmount ?? data.toAmount;
    if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
        return null;
    }

    let amountOut: bigint;
    try {
        amountOut = BigInt(String(rawAmount));
    } catch {
        return null;
    }

    return {
        amountOut
    };
}

export class OneInchAggregator {
    private apiKey: string;
    private baseUrl: string;
    private consecutiveFailures = 0;
    private disabled = false;

    constructor(apiKey: string, baseUrl: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    public isEnabled(): boolean {
        return !this.disabled;
    }

    private handleFailure(reason: string): void {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= 3) {
            this.disabled = true;
        }
    }

    private getHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-API-Key': this.apiKey,
            'accept': 'application/json',
            'User-Agent': 'morpho-arbitrage-bot/2.0'
        };
    }

    private buildQuoteUrl(request: QuoteRequest): string {
        const baseUrl = this.baseUrl.replace(/\/$/, '');
        const params = new URLSearchParams({
            fromTokenAddress: request.tokenIn.toLowerCase(),
            toTokenAddress: request.tokenOut.toLowerCase(),
            amount: request.amountIn.toString(),
            chainId: '8453'
        });

        return `${baseUrl}/quote?${params.toString()}`;
    }

    private buildSwapUrl(
        request: QuoteRequest,
        fromAddress: string,
        slippage: number,
        options: { receiver?: string; deadline?: number } = {}
    ): string {
        const baseUrl = this.baseUrl.replace(/\/$/, '');
        const params = new URLSearchParams({
            fromTokenAddress: request.tokenIn.toLowerCase(),
            toTokenAddress: request.tokenOut.toLowerCase(),
            amount: request.amountIn.toString(),
            fromAddress,
            // 1inch slippage is expressed in basis points (100 = 1%).
            slippage: slippage.toString(),
            chainId: '8453',
            // Skip the on-chain estimation: the executor (adapter) holds no
            // balance at quote time, so a simulation would fail. Slippage is
            // enforced on-chain via the encoded minReturn + the engine's own
            // step.minAmountOut check.
            disableEstimate: 'true'
        });

        if (options.receiver) {
            params.set('receiver', options.receiver);
        }
        if (options.deadline) {
            params.set('deadline', options.deadline.toString());
        }

        return `${baseUrl}/swap?${params.toString()}`;
    }

    /**
     * Get best quote from 1inch API
     * 1inch will automatically find the best route across all supported DEXes
     */
    public async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            // Rate limit 1inch API calls to stay within the free-tier quota.
            await oneInchRateLimiter.wait();

            const url = this.buildQuoteUrl(request);

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(),
                // Never let a hanging 1inch request stall the whole scan loop.
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                const body = await response.text();
                this.handleFailure(`http-${response.status}`);
                return null;
            }

            const data: any = await response.json();
            const parsed = parseOneInchQuoteResponse(data);

            if (!parsed) {
                this.handleFailure("invalid-response");
                return null;
            }

            this.consecutiveFailures = 0;

            return {
                dex: "1INCH",
                pool: "AGGREGATED",
                tokenIn: request.tokenIn,
                tokenOut: request.tokenOut,
                amountIn: request.amountIn,
                amountOut: parsed.amountOut,
                fee: 0
            };
        } catch (error) {
            this.handleFailure("request-exception");
            return null;
        }
    }

    /**
     * Get swap data from 1inch API (for execution).
     * `fromAddress` is the contract that will execute the swap (the 1inch
     * adapter); pass `receiver` to route the output to a different address
     * (defaults to `fromAddress`). The returned `tx.data` is executed against
     * `tx.to` (AggregationRouterV6).
     */
    public async getSwapData(
        request: QuoteRequest,
        fromAddress: string,
        slippage: number = 100,
        options: { receiver?: string; deadline?: number } = {}
    ): Promise<any | null> {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            // Rate limit 1inch API calls to stay within the free-tier quota.
            await oneInchRateLimiter.wait();

            const url = this.buildSwapUrl(request, fromAddress, slippage, options);

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(),
                // Never let a hanging 1inch request stall the whole scan loop.
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                this.handleFailure(`http-${response.status}`);
                return null;
            }

            const data: any = await response.json();
            if (!data?.tx?.data) {
                this.handleFailure("invalid-swap-response");
                return null;
            }

            this.consecutiveFailures = 0;
            return data;
        } catch (error) {
            this.handleFailure("request-exception");
            return null;
        }
    }

    /**
     * Check if 1inch API is available
     */
    public async checkHealth(): Promise<boolean> {
        try {
            // Simple health check by querying a known pair
            const WETH = "0x4200000000000000000000000000000000000006";
            const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
            const amount = "1000000000000000000"; // 1 WETH

            const url = this.buildQuoteUrl({
                tokenIn: WETH,
                tokenOut: USDC,
                amountIn: BigInt(amount)
            });

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(5000)
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }
}