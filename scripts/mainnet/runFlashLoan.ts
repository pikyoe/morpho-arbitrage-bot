import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";
import loadDeployment from "../utils/loadDeployment.js";

import { AdapterRegistry } from "../../bot/registry/AdapterRegistry.js";
import { FlashLoanExecutor } from "../../bot/executor/FlashLoanExecutor.js";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { PoolLoader } from "../../bot/scanner/PoolLoader.js";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { PriceOracle } from "../../bot/oracle/PriceOracle.js";
import { OpportunityLogger } from "../../bot/logger/OpportunityLogger.js";
import { PoolStateCache } from "../../bot/scanner/state/PoolStateCache.js";
import { PoolStateLoader } from "../../bot/scanner/state/PoolStateLoader.js";
import { UniswapPoolStateLoader } from "../../bot/scanner/state/UniswapPoolStateLoader.js";
import { AerodromePoolStateLoader } from "../../bot/scanner/state/AerodromePoolStateLoader.js";

import { UniswapQuote } from "../../bot/scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../../bot/scanner/quote/AerodromeQuote.js";

import { MarketPairScanner } from "../../bot/scanner/MarketPairScanner.js";
import { TOKEN_ARRAY } from "../../bot/scanner/TokenList.js";
import { ParallelMarketScanner } from "../../bot/scanner/ParallelMarketScanner.js";
import { ScannerScheduler } from "../../bot/scheduler/ScannerScheduler.js";
import { PoolStateScheduler } from "../../bot/scanner/state/PoolStateScheduler.js";

async function main() {

    const connection: any =
        await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const deployment =
        loadDeployment();

    const provider =
        ethers.provider;

    const signer =
        await ethers.provider.getSigner();

    console.log();
    console.log("========================================");
    console.log("BASE MAINNET FLASH LOAN");
    console.log("========================================");

    console.log(
        "Wallet :",
        await signer.getAddress()
    );

    console.log(
        "Engine :",
        deployment.contracts.arbitrageEngine
    );

    const engine =
        await ethers.getContractAt(

            "ArbitrageEngineV2",

            deployment.contracts.arbitrageEngine,

            signer

        );

    const executor =
        new FlashLoanExecutor(
            engine
        );

    const registry =
        new AdapterRegistry(

            deployment.contracts.uniswapAdapter,

            deployment.contracts.sushiSwapAdapter || "",

            deployment.contracts.pancakeSwapAdapter || "",

            deployment.contracts.aerodromeAdapter

        );

    //
    // Load Pools
    //

    const cache =
        new PoolCache();

    const loader =
        new PoolLoader(
            provider,
            cache
        );

    console.log();
    console.log("Loading pools...");

    await loader.loadUniswap(
        process.env.UNISWAP_FACTORY_ADDRESS!
    );

    await loader.loadAerodrome(
        process.env.AERODROME_FACTORY_ADDRESS!
    );

    console.log(
        "Pools:",
        cache.getAll().length
    );

    const stateCache =
        new PoolStateCache();

    const poolStateLoader =
        new PoolStateLoader([

            new UniswapPoolStateLoader(
                provider,
                cache,
                stateCache
            ),

            new AerodromePoolStateLoader(
                provider,
                cache,
                stateCache
            )

        ]);

    await poolStateLoader.refresh();

    const poolStateScheduler =
        new PoolStateScheduler(

            poolStateLoader,

            {

                intervalMs: 5000,

                runImmediately: true

            }

        );

    poolStateScheduler.start();

    //
    // Quote Engine
    //

    const uni =
        new UniswapQuote(

            provider,

            cache,

            process.env.UNISWAP_QUOTER_ADDRESS!

        );

    const aero =
        new AerodromeQuote(

            provider,

            cache,

            process.env.AERODROME_ROUTER!

        );

    const quoteEngine =
        new QuoteEngine([

            uni,

            aero

        ]);

    const WETH =
        process.env.WETH_ADDRESS!;

    const USDC =
        process.env.USDC_ADDRESS!;

    const oracle =
        new PriceOracle(
            provider,
            quoteEngine,
            cache,
            WETH,
            USDC
        );

    const pairScanner =
        new MarketPairScanner(
            quoteEngine,
            oracle
        );

    const scanner =
        new ParallelMarketScanner(

            pairScanner,

            TOKEN_ARRAY,

            5

        );

    const handler = {

        async onScanFinished(

            opportunities: any[]

        ) {

            if (opportunities.length === 0) {

                console.log();

                console.log(
                    "No arbitrage candidate found."
                );

                return;

            }

            const best =
                opportunities[0];

            console.log();

            console.log("========================================");

            console.log("BEST CANDIDATE");

            console.log("========================================");

            console.log(
                "BUY :",
                best.forward.dex
            );

            console.log(
                "SELL:",
                best.reverse.dex
            );

            console.log(
                "Profit:",
                ethers.formatEther(
                    best.profit
                ),
                "WETH"
            );

            console.log({

                amountIn: best.amountIn.toString(),

                amountOut: best.forward.amountOut.toString(),

                amountBack: best.reverse.amountOut.toString(),

                profit: best.profit.toString()

            });

            const gasPrice =
                await oracle.getGasPrice();

            const ethPrice =
                await oracle.getEthPriceUSD();

            OpportunityLogger.print(

                best,

                ethPrice,

                gasPrice

            );

        }

    };

    const scheduler =
        new ScannerScheduler(

            scanner,

            handler,

            2000

        );

    scheduler.start();
}

main().catch((error) => {

    console.error(error);

    process.exit(1);

});