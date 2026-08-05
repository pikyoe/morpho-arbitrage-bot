import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";

import { PoolCache } from "../scanner/PoolCache.js";

import { PoolLoader } from "../scanner/PoolLoader.js";

import { UniswapQuote } from "../scanner/quote/UniswapQuote.js";

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

            await loader.loadUniswap(

        process.env.UNISWAP_FACTORY_ADDRESS!

    );

    console.log(

        "Pools:",

        cache.getAll().length

    );

        const quoteProvider =

        new UniswapQuote(

            provider,

            cache,

            process.env.UNISWAP_QUOTER_ADDRESS!

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

        console.log(

            `Fee ${q.fee}`,

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