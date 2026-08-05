import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";

import { PoolCache } from "../scanner/PoolCache.js";

import { PoolLoader } from "../scanner/PoolLoader.js";

import { AerodromeQuote } from "../scanner/quote/AerodromeQuote.js";

async function main() {

    const connection: any =
        await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const provider =
        ethers.provider;

        const TOKENS = [

        {
            symbol: "WETH",
            address: process.env.WETH_ADDRESS!
        },

        {
            symbol: "USDC",
            address: process.env.USDC_ADDRESS!
        }

    ];
    
        const cache =
        new PoolCache();

    const loader =
        new PoolLoader(

            provider,

            cache,

            TOKENS

        );

            await loader.loadAerodrome(

        process.env.AERODROME_FACTORY_ADDRESS!

    );

    console.log(

        "Pools:",

        cache.getAll().length

    );

        const quoteProvider =

        new AerodromeQuote(

            provider,

            cache,

            process.env.AERODROME_ROUTER!

        );

        const amountIn =

        ethers.parseEther("0.01");

    const quotes =

        await quoteProvider.quote({

            tokenIn:

                process.env.WETH_ADDRESS!,

            tokenOut:

                process.env.USDC_ADDRESS!,

            amountIn

        });
        
        console.log();

    console.log("========== QUOTES ==========");

    for (const q of quotes) {

        const label =
            q.fee !== undefined
                ? `Fee ${q.fee}`
                : q.stable !== undefined
                    ? `Stable ${q.stable}`
                    : `Factory ${q.factory ?? "n/a"}`;

        console.log(

            label,

            "=>",

            ethers.formatUnits(

                q.amountOut,

                6

            ),

            "USDC"

        );

    }

}
main().catch(console.error);    