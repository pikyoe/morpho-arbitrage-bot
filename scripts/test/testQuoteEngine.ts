import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";

import { PoolCache } from "../scanner/PoolCache.js";

import { PoolLoader } from "../scanner/PoolLoader.js";

import { QuoteEngine } from "../scanner/QuoteEngine.js";

import { UniswapQuote } from "../scanner/quote/UniswapQuote.js";

import { AerodromeQuote } from "../scanner/quote/AerodromeQuote.js";

async function main() {

    const connection: any = await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const provider = ethers.provider;

    const cache = new PoolCache();

    const loader = new PoolLoader(provider, cache);

    await loader.loadUniswap(process.env.UNISWAP_FACTORY_ADDRESS!);

    await loader.loadAerodrome(process.env.AERODROME_FACTORY_ADDRESS!);

    const uni = new UniswapQuote(
        provider,
        cache,
        process.env.UNISWAP_QUOTER_ADDRESS!
    );

    const aero = new AerodromeQuote(
        provider,
        cache,
        process.env.AERODROME_ROUTER!
    );

    const engine = new QuoteEngine([uni, aero]);

    const WETH = process.env.WETH_ADDRESS!;
    const USDC = process.env.USDC_ADDRESS!;
    const amountIn = ethers.parseEther("0.01");

    const quotes = await engine.getAllQuotes({
        tokenIn: WETH,
        tokenOut: USDC,
        amountIn
    });

    const best = await engine.getBestQuote({
        tokenIn: WETH,
        tokenOut: USDC,
        amountIn
    });

    console.log();
    console.log("BEST");
    console.log(best);

    const worst = await engine.getWorstQuote({
        tokenIn: WETH,
        tokenOut: USDC,
        amountIn
    });

    console.log();
    console.log("WORST");
    console.log(worst);

    console.table(
        quotes.map(q => ({
            dex: q.dex,
            fee: q.fee,
            stable: q.stable,
            out: Number(ethers.formatUnits(q.amountOut, 6))
        }))
    );

}

main().catch(console.error);

