import { Contract, Provider, WebSocketProvider, JsonRpcProvider } from "ethers";
import { PoolCache } from "./PoolCache.js";
import { PoolInfo } from "./PoolTypes.js";
import { TOKEN_ARRAY } from "./TokenList.js";
import { getActiveUniverse } from "./TokenUniverse.js";

// Factory ABI untuk mendapatkan pools
const FACTORY_ABI = [
    "function poolCount() view returns (uint256)",
    "function pools(uint256) view returns (address)",
    "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"
];

// Pool ABI untuk mendapatkan pool data
const POOL_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function fee() view returns (uint24)",
    "function liquidity() view returns (uint128)",
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

export class RpcPoolLoader {
    private provider: Provider;
    private cache: PoolCache;
    private whitelistSet: Set<string>;

    constructor(
        provider: Provider,
        cache: PoolCache,
        customTokens?: string[] // Optional custom token list for universe experiments
    ) {
        this.provider = provider;
        this.cache = cache;
        
        // Use custom tokens if provided, otherwise use active universe, otherwise default to TOKEN_ARRAY
        const tokenList = customTokens || getActiveUniverse().tokens || TOKEN_ARRAY;
        this.whitelistSet = new Set(
            tokenList.map(address => address.toLowerCase())
        );
    }

    /**
     * Load pools from factory using RPC/multicall
     * This replaces subgraph-based pool loading
     */
    public async loadPoolsFromFactory(
        factoryAddress: string,
        dexName: string,
        maxPools: number = 50
    ): Promise<void> {
        console.log(`[${dexName}] Loading pools from factory ${factoryAddress} via RPC`);

        try {
            const factory = new Contract(factoryAddress, FACTORY_ABI, this.provider);

            // Get token list from whitelist
            const tokens = Array.from(this.whitelistSet);
            console.log(`[${dexName}] Whitelist tokens: ${tokens.length}`);

            // Generate all possible token pairs
            const tokenPairs: { tokenA: string; tokenB: string }[] = [];
            for (let i = 0; i < tokens.length; i++) {
                for (let j = i + 1; j < tokens.length; j++) {
                    tokenPairs.push({ tokenA: tokens[i], tokenB: tokens[j] });
                }
            }

            console.log(`[${dexName}] Testing ${tokenPairs.length} token pairs`);

            // Test common fee tiers
            const feeTiers = [100, 500, 3000, 10000];
            let loadedPools = 0;

            for (const { tokenA, tokenB } of tokenPairs) {
                if (loadedPools >= maxPools) break;

                for (const fee of feeTiers) {
                    if (loadedPools >= maxPools) break;

                    try {
                        const poolAddress = await factory.getPool(tokenA, tokenB, fee);

                        if (poolAddress === "0x0000000000000000000000000000000000000000") {
                            continue; // Pool doesn't exist
                        }

                        const poolData = await this.getPoolData(poolAddress, dexName);
                        if (poolData) {
                            this.cache.add(poolData);
                            loadedPools++;
                            console.log(`[${dexName}] Loaded pool ${poolAddress.slice(0,8)}... (${tokenA.slice(0,6)}↔${tokenB.slice(0,6)} fee=${fee})`);
                        }
                    } catch (error) {
                        // Skip if pool doesn't exist or other error
                        continue;
                    }
                }
            }

            console.log(`[${dexName}] Successfully loaded ${loadedPools} pools from factory`);
        } catch (error) {
            console.error(`[${dexName}] Error loading pools from factory: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Get pool data for a specific pool address
     */
    private async getPoolData(poolAddress: string, dexName: string): Promise<PoolInfo | null> {
        try {
            const pool = new Contract(poolAddress, POOL_ABI, this.provider);

            const [token0, token1, fee, liquidity, slot0] = await Promise.all([
                pool.token0(),
                pool.token1(),
                pool.fee(),
                pool.liquidity(),
                pool.slot0()
            ]);

            // Filter by whitelist
            const token0Lower = token0.toLowerCase();
            const token1Lower = token1.toLowerCase();

            if (!this.whitelistSet.has(token0Lower) && !this.whitelistSet.has(token1Lower)) {
                return null; // Skip pools without whitelisted tokens
            }

            return {
                dex: dexName as any,
                pool: poolAddress,
                token0,
                token1,
                fee: Number(fee),
                liquidity: liquidity.toString(),
                sqrtPriceX96: slot0.sqrtPriceX96.toString(),
                tick: Number(slot0.tick),
                // Uniswap V3 liquidity is not a USD reserve. Do not invent a
                // USD value from L; leave valuation to subgraph/oracle data.
                volumeUSD: 0, // Not available from factory
                createdAtTimestamp: Date.now() / 1000
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Load pools for specific token pairs
     */
    public async loadPoolsForPair(
        factoryAddress: string,
        dexName: string,
        tokenA: string,
        tokenB: string,
        fees: number[] = [100, 500, 3000, 10000]
    ): Promise<void> {
        console.log(`[${dexName}] Loading pools for ${tokenA.slice(0,6)} ↔ ${tokenB.slice(0,6)}`);

        try {
            const factory = new Contract(factoryAddress, FACTORY_ABI, this.provider);

            for (const fee of fees) {
                try {
                    const poolAddress = await factory.getPool(tokenA, tokenB, fee);

                    if (poolAddress === "0x0000000000000000000000000000000000000000") {
                        continue; // Pool doesn't exist
                    }

                    const poolData = await this.getPoolData(poolAddress, dexName);
                    if (poolData) {
                        this.cache.add(poolData);
                        console.log(`[${dexName}] Loaded pool ${poolAddress.slice(0,8)}... fee=${fee}`);
                    }
                } catch (error) {
                    continue;
                }
            }
        } catch (error) {
            console.error(`[${dexName}] Error loading pools for pair: ${error instanceof Error ? error.message : error}`);
        }
    }
}

/**
 * Create WebSocket provider for DEX-specific RPC calls
 */
export function createWebSocketProvider(wsUrl: string): WebSocketProvider {
    return new WebSocketProvider(wsUrl);
}

/**
 * Create JsonRpc provider for DEX-specific RPC calls
 */
export function createJsonRpcProvider(httpUrl: string): JsonRpcProvider {
    return new JsonRpcProvider(httpUrl);
}
