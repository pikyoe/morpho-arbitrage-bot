import { Contract, Provider, ZeroAddress } from "ethers";
import { PoolCache } from "../PoolCache.js";
import { QuoteRequest, QuoteResult } from "./index.js";
import { DexQuoteProvider } from "./DexQuoteProvider.js";
import { quoteRateLimiter } from "../../utils/RateLimiter.js";
import { AERODROME_ROUTER_ABI } from "../abis/AerodromeRouter.js";

const VERBOSE_LOGGING = process.env.VERBOSE_QUOTE_LOGGING === "true";
/** Aerodrome V2/stable-pool provider. The configured quoter address is the router. */
export class AerodromeDexProvider implements DexQuoteProvider {
    private readonly provider: Provider;
    private readonly router: Contract;
    private readonly factory: Contract;
    private readonly factoryAddress: string;
    private readonly cache: PoolCache;
    private enabled = true;

    constructor(
        _provider: Provider,
        cache: PoolCache,
        routerAddress: string,
        factoryAddress: string
    ) {
        this.provider = _provider;
        this.router = new Contract(routerAddress, AERODROME_ROUTER_ABI, _provider);
        this.factory = new Contract(factoryAddress, ["function getPool(address,address,bool) view returns (address)"], _provider);
        this.factoryAddress = factoryAddress;
        this.cache = cache;
    }

    async quote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (!this.enabled) return null;
        let best: QuoteResult | null = null;

        for (const stable of [false, true]) {
            try {
                const cachedPools = this.cache.findPair(request.tokenIn, request.tokenOut)
                    .filter(pool => pool.dex.toLowerCase() === "aerodrome" && pool.stable === stable);
                let poolAddress = cachedPools[0]?.pool ?? ZeroAddress;
                if (poolAddress === ZeroAddress) {
                    await quoteRateLimiter.wait();
                    poolAddress = await this.factory.getPool(request.tokenIn, request.tokenOut, stable);
                    if (!poolAddress || poolAddress === ZeroAddress) continue;
                }
                // Aerodrome V2 Router can revert with "!y" when a pool exists
                // but one side has zero reserves. Check reserves first.
                const poolContract = new Contract(
                    poolAddress,
                    ["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"],
                    this.provider
                );
                const reserves = await poolContract.getReserves();
                if (reserves[0] === 0n || reserves[1] === 0n) continue;
                // Keep the cache synchronized with the same reserve state used
                // by the executable quote. Raw reserves are intentionally kept
                // separate from reserveUSD because token decimals/prices vary.
                const cached = cachedPools[0];
                this.cache.add({
                    dex: "AERODROME",
                    pool: poolAddress,
                    token0: cached?.token0 ?? request.tokenIn,
                    token1: cached?.token1 ?? request.tokenOut,
                    stable,
                    factory: this.factoryAddress,
                    reserve0Raw: reserves[0].toString(),
                    reserve1Raw: reserves[1].toString(),
                    liquiditySource: "rpc",
                    liquidityUpdatedBlock: await this.provider.getBlockNumber()
                });
                await quoteRateLimiter.wait();
                const routes = [{
                    from: request.tokenIn,
                    to: request.tokenOut,
                    stable,
                    factory: this.factoryAddress
                }];
                const amounts = await this.router.getAmountsOut(request.amountIn, routes);
                const amountOut = amounts[amounts.length - 1] as bigint;
                if (!amountOut || amountOut <= 0n) continue;

                const candidate: QuoteResult = {
                    dex: "AERODROME",
                    // The V2 router is the authoritative quote source; pool discovery
                    // is intentionally omitted because factory overloads vary by deployment.
                    pool: poolAddress,
                    tokenIn: request.tokenIn,
                    tokenOut: request.tokenOut,
                    amountIn: request.amountIn,
                    amountOut,
                    fee: 0,
                    stable,
                    factory: this.factoryAddress
                };
                if (!best || amountOut > best.amountOut) best = candidate;
            } catch (error) {
                // Missing/empty pools commonly revert in the Aerodrome Router;
                // treat them as unavailable quotes and keep scanning quietly.
            }
        }

        return best;
    }

    getDexName(): string { return "Aerodrome"; }
    isEnabled(): boolean { return this.enabled; }
    enable(): void { this.enabled = true; }
    disable(): void { this.enabled = false; }
}
