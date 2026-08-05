import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";
import { fundWETH } from "../utils/fundFork.js";
import fs from "fs";

const ERC20_ABI = [
    "function balanceOf(address) view returns(uint256)",
    "function allowance(address,address) view returns(uint256)",
    "function approve(address,uint256) returns(bool)",
    "function decimals() view returns(uint8)"
];

async function balance(
    token: any,
    address: string
) {
    return await token.balanceOf(address);
}

async function printBalances(
    title: string,
    weth: any,
    usdc: any,
    address: string,
    ethers: any
) {
    console.log();
    console.log("====================================");
    console.log(title);
    console.log("====================================");

    console.log(
        "WETH:",
        ethers.formatEther(
            await weth.balanceOf(address)
        )
    );

    console.log(
        "USDC:",
        (
            await usdc.balanceOf(address)
        ).toString()
    );
}

async function traceTransaction(provider: any, txHash: string) {
    const attempts = [
        {
            method: "debug_traceTransaction",
            params: [txHash, { tracer: "callTracer" }]
        },
        {
            method: "hardhat_traceTransaction",
            params: [txHash]
        }
    ];

    for (const attempt of attempts) {
        try {
            const result = await provider.send(
                attempt.method,
                attempt.params
            );

            return {
                method: attempt.method,
                result
            };
        } catch (error) {
            console.log(`Trace method ${attempt.method} failed:`, error);
        }
    }

    throw new Error("Unable to trace transaction with debug_traceTransaction or hardhat_traceTransaction");
}

async function main() {

    const connection: any =
        await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const signer =
        await ethers.provider.getSigner();

    const signerAddress =
        await signer.getAddress();

    console.log("========================================");
    console.log("FLASH LOAN ARBITRAGE TEST");
    console.log("========================================");

    console.log(
        "Signer:",
        signerAddress
    );

    //--------------------------------------------------
    // ENV
    //--------------------------------------------------

    const WETH =
        process.env.WETH_ADDRESS!;

    const USDC =
        process.env.USDC_ADDRESS!;

    const MORPHO =
        process.env.MORPHO_ADDRESS!;

    const UNISWAP_ROUTER =
        process.env.UNISWAP_ROUTER_ADDRESS!;

    const AERODROME_ROUTER =
        process.env.AERODROME_ROUTER!;

    const AERODROME_FACTORY =
        process.env.AERODROME_FACTORY!;

    if (
        !WETH ||
        !USDC ||
        !MORPHO ||
        !UNISWAP_ROUTER ||
        !AERODROME_ROUTER ||
        !AERODROME_FACTORY
    ) {
        throw new Error(
            "Missing environment variables."
        );
    }

    //--------------------------------------------------
    // DEPLOY MORPHO
    //--------------------------------------------------

    console.log();
    console.log("Deploy MorphoFlashLoanV2");

    const flashLoan =
        await ethers.deployContract(
            "MorphoFlashLoanV2",
            [
                signerAddress,
                MORPHO
            ]
        );

    await flashLoan.waitForDeployment();

    const flashLoanAddress =
        await flashLoan.getAddress();

    console.log(
        "MorphoFlashLoan:",
        flashLoanAddress
    );

    //--------------------------------------------------
    // DEPLOY UNISWAP
    //--------------------------------------------------

    console.log();
    console.log("Deploy Uniswap Adapter");

    const uni =
        await ethers.deployContract(
            "UniswapV3AdapterV2",
            [
                signerAddress,
                UNISWAP_ROUTER,
                signerAddress
            ]
        );

    await uni.waitForDeployment();

    const uniAddress =
        await uni.getAddress();

    console.log(
        "Uniswap:",
        uniAddress
    );

    //--------------------------------------------------
    // DEPLOY AERODROME
    //--------------------------------------------------

    console.log();
    console.log("Deploy Aerodrome Adapter");

    const aero =
        await ethers.deployContract(
            "AerodromeAdapterV2",
            [
                signerAddress,
                AERODROME_ROUTER,
                signerAddress
            ]
        );

    await aero.waitForDeployment();

    const aeroAddress =
        await aero.getAddress();

    console.log(
        "Aerodrome:",
        aeroAddress
    );

    //--------------------------------------------------
    // DEPLOY ENGINE
    //--------------------------------------------------

    console.log();
    console.log("Deploy ArbitrageEngineV2");

    const engine =
        await ethers.deployContract(
            "ArbitrageEngineV2",
            [
                signerAddress,
                flashLoanAddress,
                signerAddress,
                uniAddress,
                aeroAddress
            ]
        );

    await engine.waitForDeployment();

    const engineAddress =
        await engine.getAddress();

    console.log(
        "Engine:",
        engineAddress
    );

    const engineContract = engine;

    //--------------------------------------------------
    // WIRING
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("WIRING");
    console.log("==============================");

    await (
        await flashLoan.setEngine(
            engineAddress
        )
    ).wait();

    await (
        await uni.setEngine(
            engineAddress
        )
    ).wait();

    await (
        await aero.setEngine(
            engineAddress
        )
    ).wait();

    console.log("Wrapper -> Engine OK");
    console.log("Uniswap -> Engine OK");
    console.log("Aerodrome -> Engine OK");

    //--------------------------------------------------
    // APPROVE ADAPTERS
    //--------------------------------------------------

    console.log();
    console.log("Approve adapters...");

    await (
        await engineContract.setApprovedAdapter(
            uniAddress,
            true
        )
    ).wait();

    await (
        await engineContract.setApprovedAdapter(
            aeroAddress,
            true
        )
    ).wait();

    console.log("Approved.");

    //--------------------------------------------------
    // ERC20
    //--------------------------------------------------

    const weth =
        new ethers.Contract(
            WETH,
            ERC20_ABI,
            signer
        );

    const usdc =
        new ethers.Contract(
            USDC,
            ERC20_ABI,
            signer
        );

    //--------------------------------------------------
    // FUND ENGINE
    //--------------------------------------------------

    const flashAmount =
        ethers.parseEther("0.01");

    await fundWETH(
        hre,
        engineAddress,
        flashAmount
    );

    await printBalances(
        "ENGINE BALANCE",
        weth,
        usdc,
        engineAddress,
        ethers
    );

    const amountIn = flashAmount;

    //--------------------------------------------------
    // BUILD ROUTE
    //--------------------------------------------------

    const deadline =
        Math.floor(Date.now() / 1000) + 300;

    const aeroRouteData =
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["bool","address"],
            [
                false,
                AERODROME_FACTORY
            ]
        );

    const route = {
        swaps: [

            {
                adapter: uniAddress,
                tokenIn: WETH,
                tokenOut: USDC,
                fee: 3000,
                amountIn: 0,
                minAmountOut: 1,
                deadline,
                data: "0x"
            },

            {
                adapter: aeroAddress,
                tokenIn: USDC,
                tokenOut: WETH,
                fee: 0,
                amountIn: 0,
                minAmountOut: 1,
                deadline,
                data: aeroRouteData
            }

        ],

        profitToken: WETH,

        minProfit: 0
    };

    console.log("Route created.");


        //--------------------------------------------------
    // VALIDATE ROUTE
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("VALIDATE ROUTE");
    console.log("==============================");

    const valid =
        await engineContract.validateRoute(
            route,
            WETH
        );

    console.log("Route Valid =", valid);


    //--------------------------------------------------
    // BALANCE BEFORE
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("BALANCE BEFORE");
    console.log("==============================");

    const wethBefore =
        await weth.balanceOf(engineAddress);

    const usdcBefore =
        await usdc.balanceOf(engineAddress);

    console.log(
        "Engine WETH:",
        ethers.formatEther(wethBefore)
    );

    console.log(
        "Engine USDC:",
        usdcBefore.toString()
    );


    //--------------------------------------------------
    // EXECUTE FLASH LOAN
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("EXECUTE FLASH LOAN");
    console.log("==============================");

    try {

        const tx =
            await engineContract.executeArbitrage(
                WETH,
                amountIn,
                route,
                {
                    gasLimit: 8_000_000
                }
            );

        console.log(
            "Transaction:",
            tx.hash
        );

        let receipt;

        try {

            receipt =
                await tx.wait();

        } catch {

            console.log(
                "Transaction reverted."
            );

            receipt =
                await ethers.provider.getTransactionReceipt(
                    tx.hash
                );

            console.log(
                "Receipt status:",
                receipt?.status
            );

            const trace = await traceTransaction(ethers.provider, tx.hash);

            fs.writeFileSync(
                "trace.json",
                JSON.stringify(trace.result, null, 2)
            );

            console.log("Trace saved to trace.json");

            throw new Error(
                "Flash loan transaction reverted."
            );
        }

        console.log(
            "Gas Used:",
            receipt.gasUsed.toString()
        );

    } catch (err) {

        console.error(err);

        throw err;
    }


    //--------------------------------------------------
    // BALANCE AFTER
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("BALANCE AFTER");
    console.log("==============================");

    const wethAfter =
        await weth.balanceOf(engineAddress);

    const usdcAfter =
        await usdc.balanceOf(engineAddress);

    console.log(
        "Engine WETH:",
        ethers.formatEther(wethAfter)
    );

    console.log(
        "Engine USDC:",
        usdcAfter.toString()
    );


    //--------------------------------------------------
    // PROFIT RECEIVER
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("PROFIT RECEIVER");
    console.log("==============================");

    const ownerProfit =
        await weth.balanceOf(
            signerAddress
        );

    console.log(
        "Owner WETH:",
        ethers.formatEther(ownerProfit)
    );


    //--------------------------------------------------
    // VERIFY
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("VERIFY");
    console.log("==============================");

    if (
        ownerProfit <= amountIn
    ) {
        console.log(
            "No profit distributed."
        );
    } else {

        console.log(
            "✓ Profit distributed."
        );
    }

    console.log(
        "FlashLoan Token:",
        await engineContract.flashLoanToken()
    );

    console.log(
        "FlashLoan Amount:",
        (
            await engineContract.flashLoanAmount()
        ).toString()
    );

    console.log();
    console.log("==============================");
    console.log("TEST FINISHED");
    console.log("==============================");
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});