import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";

import { PoolCache } from "../scanner/PoolCache.js";
import { PoolLoader } from "../scanner/PoolLoader.js";
import { QuoteEngine } from "../scanner/QuoteEngine.js";
import { PriceOracle } from "../oracle/PriceOracle.js";
import { UniswapQuote } from "../scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../scanner/quote/AerodromeQuote.js";
import { MarketPairScanner } from "../scanner/MarketPairScanner.js";

async function main() {

    const connection: any = await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const provider = ethers.provider;

    const cache = new PoolCache();
    const loader = new PoolLoader(provider, cache);

    await loader.loadUniswap(process.env.UNISWAP_FACTORY_ADDRESS!);
    await loader.loadAerodrome(process.env.AERODROME_FACTORY_ADDRESS!);

    const uni = new UniswapQuote(provider, cache, process.env.UNISWAP_QUOTER_ADDRESS!);
    const aero = new AerodromeQuote(provider, cache, process.env.AERODROME_ROUTER!);

    const WETH = process.env.WETH_ADDRESS!;
    const USDC = process.env.USDC_ADDRESS!;

    const quoteEngine = new QuoteEngine([uni, aero]);
    const oracle = new PriceOracle(provider, quoteEngine, cache, WETH, USDC);
    const scanner = new MarketPairScanner(quoteEngine, oracle);
    const amountIn = ethers.parseEther("0.01");

    const result = await scanner.scan(WETH, USDC, amountIn);

    console.table(
        result.map(r => ({
            buyDex: r.forward.dex,
            sellDex: r.reverse.dex,
            buyFee: r.forward.fee,
            sellFee: r.reverse.fee,
            buyStable: r.forward.stable,
            sellStable: r.reverse.stable,
            profit: Number(ethers.formatEther(r.profit))
        }))
    );

}

main().catch(console.error);

