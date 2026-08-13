import { Contract, ethers } from "ethers";

import { PoolCache } from "./PoolCache.js";
import { TOKEN_ARRAY } from "./TokenList.js";
import { rpcRateLimiter } from "../utils/RateLimiter.js";

import { UNISWAP_FACTORY_ABI } from "./abis/UniswapFactory.js";
import { AERODROME_FACTORY_ABI } from "./abis/AerodromeFactory.js";

const FEES = [

    100,
    500,
    3000,
    10000

];

const STABLES = [

    false,

    true

];

export class PoolLoader {

    constructor(

        private readonly provider: any,

        private readonly cache: PoolCache

    ) {}

    /** Normalize an address: lowercase first so any casing is accepted, then
     *  ethers computes the correct EIP-55 checksum. Returns null only when the
     *  string itself is not a valid hex address (length/characters). */
    private norm(addr: string): string | null {
        try {
            return ethers.getAddress(addr.toLowerCase());
        } catch {
            return null;
        }
    }

    async loadUniswap(
        factoryAddress: string
    ) {

        const factory = new Contract(

            factoryAddress,

            UNISWAP_FACTORY_ABI,

            this.provider

        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {

            const tokenA = this.norm(TOKEN_ARRAY[i]);
            if (!tokenA) continue;

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {

                const tokenB = this.norm(TOKEN_ARRAY[j]);
                if (!tokenB) continue;

                for (const fee of FEES) {

                    await rpcRateLimiter.wait();

                    const pool = await factory.getPool(

                        tokenA,

                        tokenB,

                        fee

                    );

                    if (
                        pool ===
                        "0x0000000000000000000000000000000000000000"
                    ) {
                        continue;
                    }

                    this.cache.add({

                        dex: "UNISWAP",

                        pool,

                        token0: tokenA,

                        token1: tokenB,

                        fee

                    });

                }

            }

        }

    }

    async loadAerodrome(
        factoryAddress: string
    ) {

        const factory = new Contract(

            factoryAddress,

            AERODROME_FACTORY_ABI,

            this.provider

        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {

            const tokenA = this.norm(TOKEN_ARRAY[i]);
            if (!tokenA) continue;

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {

                const tokenB = this.norm(TOKEN_ARRAY[j]);
                if (!tokenB) continue;

                for (const stable of STABLES) {

                    await rpcRateLimiter.wait();

                    const pool = await factory.getPool(

                        tokenA,

                        tokenB,

                        stable

                    );

                    if (pool === ethers.ZeroAddress) {
                        continue;
                    }

                    this.cache.add({

                        dex: "AERODROME",

                        pool,

                        token0: tokenA,

                        token1: tokenB,

                        stable,

                        factory: factoryAddress

                    });

                }

            }

        }

    }

    async loadSushiSwap(
        factoryAddress: string
    ) {
        // SushiSwap V3 uses the same factory interface as Uniswap V3
        const factory = new Contract(
            factoryAddress,
            UNISWAP_FACTORY_ABI,
            this.provider
        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {
            const tokenA = this.norm(TOKEN_ARRAY[i]);
            if (!tokenA) continue;

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {
                const tokenB = this.norm(TOKEN_ARRAY[j]);
                if (!tokenB) continue;

                for (const fee of FEES) {
                    const pool = await rpcRateLimiter.wait().then(() =>
                        factory.getPool(
                        tokenA,
                        tokenB,
                        fee
                    ));

                    if (pool === "0x0000000000000000000000000000000000000000") {
                        continue;
                    }

                    // Check if pool has liquidity by trying to get slot0
                    try {
                        const poolContract = new Contract(
                            pool,
                            ["function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"],
                            this.provider
                        );
                        const slot0 = await poolContract.slot0();
                        
                        // Only add pool if it has been initialized (sqrtPriceX96 > 0)
                        if (slot0.sqrtPriceX96 > 0n) {
                            this.cache.add({
                                dex: "SUSHISWAP",
                                pool,
                                token0: tokenA,
                                token1: tokenB,
                                fee
                            });
                        }
                    } catch (error) {
                        // Pool doesn't exist or doesn't have liquidity, skip it
                        continue;
                    }
                }
            }
        }
    }

    async loadPancakeSwap(
        factoryAddress: string
    ) {
        // PancakeSwap V3 uses the same factory interface as Uniswap V3
        const factory = new Contract(
            factoryAddress,
            UNISWAP_FACTORY_ABI,
            this.provider
        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {
            const tokenA = this.norm(TOKEN_ARRAY[i]);
            if (!tokenA) continue;

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {
                const tokenB = this.norm(TOKEN_ARRAY[j]);
                if (!tokenB) continue;

                for (const fee of FEES) {
                    const pool = await rpcRateLimiter.wait().then(() =>
                        factory.getPool(
                        tokenA,
                        tokenB,
                        fee
                    ));

                    if (pool === "0x0000000000000000000000000000000000000000") {
                        continue;
                    }

                    // Check if pool has liquidity by trying to get slot0
                    try {
                        const poolContract = new Contract(
                            pool,
                            ["function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"],
                            this.provider
                        );
                        const slot0 = await poolContract.slot0();
                        
                        // Only add pool if it has been initialized (sqrtPriceX96 > 0)
                        if (slot0.sqrtPriceX96 > 0n) {
                            this.cache.add({
                                dex: "PANCAKESWAP",
                                pool,
                                token0: tokenA,
                                token1: tokenB,
                                fee
                            });
                        }
                    } catch (error) {
                        // Pool doesn't exist or doesn't have liquidity, skip it
                        continue;
                    }
                }
            }
        }
    }

}

