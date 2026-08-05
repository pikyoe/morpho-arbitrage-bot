import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { fundWETH } from "../utils/fundFork.js";


//==================================================
// ERC20 ABI
//==================================================

const ERC20_ABI = [
    "function balanceOf(address) view returns(uint256)",
    "function allowance(address,address) view returns(uint256)",
    "function transfer(address,uint256) returns(bool)",
    "function approve(address,uint256) returns(bool)",
    "function decimals() view returns(uint8)"
];


//==================================================
// QUOTER V2 ABI
//==================================================

const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns(uint256)"
];

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

async function debugStaticCall(adapter: any, swapStep: any, fromAddress: string) {
    try {
        const result = await adapter.swap.staticCall(swapStep, {
            from: fromAddress,
            gasLimit: 4_000_000
        });

        console.log("Static call succeeded:", result.toString());
    } catch (err: any) {
        console.log("Static call reverted");
        console.log("message:", err?.message);
        console.log("shortMessage:", err?.shortMessage);
        console.log("data:", err?.data);

        if (err?.data) {
            try {
                console.log("decoded:", adapter.interface.parseError(err.data));
            } catch (parseErr) {
                console.log("parseError failed:", parseErr);
            }
        }
    }
}

//==================================================
// MAIN
//==================================================

async function main() {

    //--------------------------------------------------
    // CONNECT
    //--------------------------------------------------

    const connection: any =
        await hre.network.connect();

    const { ethers } =
        connection;

    loadEnvForNetwork(hre);

    const signer =
        await ethers.provider.getSigner();

    console.log("========================================");
    console.log("UNISWAP ADAPTER FORK TEST");
    console.log("========================================");

    console.log(
        "Signer :",
        await signer.getAddress()
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

    const UNISWAP_QUOTER =
        process.env.UNISWAP_QUOTER_ADDRESS!;

    const AERODROME_ROUTER =
        process.env.AERODROME_ROUTER!;

    if (
        !WETH ||
        !USDC ||
        !MORPHO ||
        !UNISWAP_ROUTER ||
        !UNISWAP_QUOTER ||
        !AERODROME_ROUTER
    ) {
        throw new Error(
            "Missing environment variables."
        );
    }



    //--------------------------------------------------
    // DEPLOY MORPHO FLASHLOAN
    //--------------------------------------------------

    console.log();
    console.log(
        "Deploying MorphoFlashLoanV2..."
    );

    const morphoFlashLoan =
        await ethers.deployContract(
            "MorphoFlashLoanV2",
            [
                await signer.getAddress(),
                MORPHO
            ]
        );

    await morphoFlashLoan.waitForDeployment();

    const morphoFlashLoanAddress =
        await morphoFlashLoan.getAddress();

    console.log(
        "MorphoFlashLoanV2:",
        morphoFlashLoanAddress
    );



    //--------------------------------------------------
    // DEPLOY UNISWAP ADAPTER
    //--------------------------------------------------

    console.log();
    console.log(
        "Deploying UniswapV3AdapterV2..."
    );

    const uniswapAdapter =
        await ethers.deployContract(
            "UniswapV3AdapterV2",
            [
                await signer.getAddress(),
                UNISWAP_ROUTER,
                await signer.getAddress()   // temporary engine
            ]
        );

    await uniswapAdapter.waitForDeployment();

    const uniswapAdapterAddress =
        await uniswapAdapter.getAddress();

    console.log(
        "Uniswap Adapter:",
        uniswapAdapterAddress
    );



    //--------------------------------------------------
    // DEPLOY AERODROME ADAPTER
    //--------------------------------------------------

    console.log();
    console.log(
        "Deploying AerodromeAdapterV2..."
    );

    const aerodromeAdapter =
        await ethers.deployContract(
            "AerodromeAdapterV2",
            [
                await signer.getAddress(),
                AERODROME_ROUTER,
                await signer.getAddress()   // temporary engine
            ]
        );

    await aerodromeAdapter.waitForDeployment();

    const aerodromeAdapterAddress =
        await aerodromeAdapter.getAddress();

    console.log(
        "Aerodrome Adapter:",
        aerodromeAdapterAddress
    );

    //--------------------------------------------------
    // DEPLOY TEST ARBITRAGE ENGINE
    //--------------------------------------------------

    console.log();
    console.log(
        "Deploying TestArbitrageEngine..."
    );

    const engine =
        await ethers.deployContract(
            "TestArbitrageEngine",
            [
                await signer.getAddress(),
                morphoFlashLoanAddress,
                await signer.getAddress(),
                uniswapAdapterAddress,
                aerodromeAdapterAddress
            ]
        );

    await engine.waitForDeployment();

    const engineAddress =
        await engine.getAddress();

    console.log(
        "TestArbitrageEngine:",
        engineAddress
    );


    //--------------------------------------------------
    // WIRING
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("WIRING");
    console.log("==============================");

    await (
        await morphoFlashLoan.setEngine(
            engineAddress
        )
    ).wait();

    await (
        await uniswapAdapter.setEngine(
            engineAddress
        )
    ).wait();

    await (
        await aerodromeAdapter.setEngine(
            engineAddress
        )
    ).wait();

    console.log("Wrapper -> Engine OK");
    console.log("Uniswap -> Engine OK");
    console.log("Aerodrome -> Engine OK");


    //--------------------------------------------------
    // VERIFY WIRING
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("VERIFY WIRING");
    console.log("==============================");

    console.log(
        "Wrapper Engine :",
        await morphoFlashLoan.engine()
    );

    console.log(
        "Uniswap Engine:",
        await uniswapAdapter.engine()
    );

    console.log(
        "Aerodrome Engine:",
        await aerodromeAdapter.engine()
    );


    //--------------------------------------------------
    // CONTRACT INSTANCES
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

    const quoter =
        new ethers.Contract(
            UNISWAP_QUOTER,
            QUOTER_ABI,
            signer
        );

    const testEngine =
        await ethers.getContractAt(
            "TestArbitrageEngine",
            engineAddress
        );


    //--------------------------------------------------
    // FUND ENGINE
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("FUND ENGINE");
    console.log("==============================");

    const amountIn =
        ethers.parseEther("0.01");

    await fundWETH(
        hre,
        engineAddress,
        amountIn
    );

    console.log(
        "Engine funded:",
        ethers.formatEther(amountIn),
        "WETH"
    );


    //--------------------------------------------------
    // INITIAL BALANCES
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("INITIAL BALANCES");
    console.log("==============================");

    console.log("engineAddress =", engineAddress);

    console.log(
        "balance script =",
        (
            await weth.balanceOf(engineAddress)
        ).toString()
    );

    console.log(
        "balance contract =",
        (
            await testEngine.balanceOf(WETH)
        ).toString()
    );

    const engineWeth =
        await testEngine.balanceOf(
            WETH
        );

    const engineUsdc =
        await testEngine.balanceOf(
            USDC
        );

    console.log(
        "Engine WETH:",
        ethers.formatEther(
            engineWeth
        )
    );

    console.log(
        "Engine USDC:",
        engineUsdc.toString()
    );

    //--------------------------------------------------
    // GET QUOTE
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("GETTING QUOTE");
    console.log("==============================");

    const fees = [100, 500, 3000, 10000];

    for (const fee of fees) {
        try {
            const q = await quoter.quoteExactInputSingle.staticCall([
                WETH,
                USDC,
                amountIn,
                fee,
                0
            ]);

            console.log(
                fee,
                q[0].toString()
            );
        } catch {
            console.log(
                fee,
                "NO POOL"
            );
        }
    }

    const quote =
        await quoter.quoteExactInputSingle.staticCall([
            WETH,
            USDC,
            amountIn,
            3000,
            0
        ]);

    const amountOut = quote[0];

    console.log(
        "Quoted Out:",
        amountOut.toString()
    );

    const minAmountOut = 1n;

    console.log(
        "Minimum Out:",
        minAmountOut.toString()
    );

    const router = new ethers.Contract(
        UNISWAP_ROUTER,
        ROUTER_ABI,
        signer
    );

    await (
        await weth.approve(
            UNISWAP_ROUTER,
            amountIn
        )
    ).wait();

    const tx = await router.exactInputSingle({
        tokenIn: WETH,
        tokenOut: USDC,
        fee: 3000,
        recipient: await signer.getAddress(),
        amountIn,
        amountOutMinimum: 1,
        sqrtPriceLimitX96: 0
    });

    await tx.wait();

    console.log("Direct router swap success");

    //--------------------------------------------------
    // BALANCE BEFORE
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("BALANCE BEFORE");
    console.log("==============================");

    const wethBefore =
        await testEngine.balanceOf(WETH);

    const usdcBefore =
        await testEngine.balanceOf(USDC);

    console.log(
        "Engine WETH:",
        ethers.formatEther(wethBefore)
    );

    console.log(
        "Engine USDC:",
        usdcBefore.toString()
    );

    //--------------------------------------------------
    // APPROVE ADAPTER
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("APPROVE ADAPTER");
    console.log("==============================");

    await (
        await testEngine.approveForTest(
            WETH,
            uniswapAdapterAddress,
            amountIn
        )
    ).wait();

    console.log("Approve OK");

    //--------------------------------------------------
    // BUILD SWAP
    //--------------------------------------------------

    const swapDeadline =
        Math.floor(Date.now() / 1000) + 300;

    const swapStep = {
        adapter: uniswapAdapterAddress,
        tokenIn: WETH,
        tokenOut: USDC,
        fee: 3000,
        amountIn: amountIn,
        minAmountOut: minAmountOut,
        data: "0x",
        deadline: swapDeadline
    };

    //--------------------------------------------------
    // EXECUTE SWAP
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("EXECUTING SWAP");
    console.log("==============================");

    console.log("Engine WETH:",
        (await weth.balanceOf(engineAddress)).toString()
    );

    console.log("Adapter Allowance:",
        (
            await weth.allowance(
                engineAddress,
                uniswapAdapterAddress
            )
        ).toString()
    );

    console.log(
        "Adapter Engine:",
        await uniswapAdapter.engine()
    );

    console.log(
        "Router:",
        await uniswapAdapter.router()
    );

    const engineWethBeforeSwap = await testEngine.balanceOf(WETH);
    console.log("engineWethBeforeSwap =", engineWethBeforeSwap.toString());

    if (engineWethBeforeSwap !== amountIn) {
        throw new Error(
            `Engine WETH balance before swap is ${engineWethBeforeSwap.toString()}, expected ${amountIn.toString()}`
        );
    }

    try {
        const txData = testEngine.interface.encodeFunctionData("testExecuteSwap", [swapStep]);
        const txRequest = {
            from: await signer.getAddress(),
            to: engineAddress,
            data: txData,
            gasLimit: 4_000_000,
            gasPrice: 1_000_000_000n
        };

        const txResponse = await signer.sendTransaction(txRequest);
        console.log("Transaction Hash:", txResponse.hash);

        let receipt: any;
        try {
            receipt = await txResponse.wait();
        } catch (waitError) {
            console.log("Transaction reverted during wait; fetching receipt...");
            receipt = await ethers.provider.getTransactionReceipt(txResponse.hash);
            console.log("Receipt status:", receipt?.status);
        }

        const trace = await traceTransaction(ethers.provider, txResponse.hash);
        console.log(JSON.stringify(trace.result, null, 2));

    } catch (e) {
        console.log("Caught error:", e);
        if ((e as any)?.data) {
            console.log("Raw error data:", (e as any).data);
        }
        if ((e as any)?.shortMessage) {
            console.log("shortMessage:", (e as any).shortMessage);
        }
        throw e;
    }

    //--------------------------------------------------
    // BALANCE AFTER
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("BALANCE AFTER");
    console.log("==============================");

    const wethAfter =
        await testEngine.balanceOf(WETH);

    const usdcAfter =
        await testEngine.balanceOf(USDC);

    console.log(
        "Engine WETH:",
        ethers.formatEther(wethAfter)
    );

    console.log(
        "Engine USDC:",
        usdcAfter.toString()
    );

    //--------------------------------------------------
    // VERIFY
    //--------------------------------------------------

    console.log();
    console.log("==============================");
    console.log("VERIFY");
    console.log("==============================");

    if (wethAfter >= wethBefore) {
        throw new Error(
            "WETH balance did not decrease."
        );
    }

    if (usdcAfter <= usdcBefore) {
        throw new Error(
            "USDC balance did not increase."
        );
    }

    console.log("✓ Swap executed successfully");
    console.log("✓ WETH spent");
    console.log("✓ USDC received");
    console.log("========================================");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

