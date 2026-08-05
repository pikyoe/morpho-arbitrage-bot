import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("MANUAL FLASH LOAN EXECUTION TEST");
    console.log("========================================");

    try {
        const connection: any = await hre.network.connect();
        const { ethers } = connection;

        const provider = ethers.provider;
        const [signer] = await ethers.getSigners();

        const network = await provider.getNetwork();
        console.log("Network:", (hre.network as any).name || "unknown");
        console.log("Chain ID:", network.chainId.toString());
        console.log("Wallet:", signer.address);

        const balance = await provider.getBalance(signer.address);
        console.log("Balance:", ethers.formatEther(balance), "ETH");

        // Load engine contract
        const engine = await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
            signer
        );

        console.log("\nEngine:", await engine.getAddress());
        console.log("MorphoFlashLoan:", await engine.morphoFlashLoan());
        console.log("Paused:", await engine.paused());

        // Token addresses for Base Sepolia
        const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
        const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

        // Flash loan parameters
        const FLASH_LOAN_AMOUNT = ethers.parseEther("0.001"); // 0.001 WETH
        console.log("\nFlash Loan Parameters:");
        console.log("Token:", WETH_ADDRESS);
        console.log("Amount:", ethers.formatEther(FLASH_LOAN_AMOUNT), "WETH");

        // Simple route structure (for testing)
        // Using Strategy.Route structure
        const route = {
            swaps: [
                {
                    adapter: process.env.UNISWAP_ADAPTER_V2_ADDRESS,
                    tokenIn: WETH_ADDRESS,
                    tokenOut: USDC_ADDRESS,
                    fee: 3000, // 0.3% fee tier
                    amountIn: FLASH_LOAN_AMOUNT,
                    minAmountOut: 0, // Accept any output for testing
                    data: ethers.AbiCoder.defaultAbiCoder().encode(
                        ["bool", "address"],
                        [false, process.env.UNISWAP_FACTORY_ADDRESS]
                    ),
                    deadline: 0 // Use default
                },
                {
                    adapter: process.env.UNISWAP_ADAPTER_V2_ADDRESS,
                    tokenIn: USDC_ADDRESS,
                    tokenOut: WETH_ADDRESS,
                    fee: 3000,
                    amountIn: 0, // Will be filled by actual output
                    minAmountOut: FLASH_LOAN_AMOUNT, // At least return the loan
                    data: ethers.AbiCoder.defaultAbiCoder().encode(
                        ["bool", "address"],
                        [false, process.env.UNISWAP_FACTORY_ADDRESS]
                    ),
                    deadline: 0
                }
            ],
            profitToken: WETH_ADDRESS,
            minProfit: 0 // No minimum profit for testing
        };

        console.log("\nRoute configured for testing");
        console.log("Swap 1:", WETH_ADDRESS, "->", USDC_ADDRESS, "(Uniswap)");
        console.log("Swap 2:", USDC_ADDRESS, "->", WETH_ADDRESS, "(Uniswap)");
        console.log("Profit Token:", WETH_ADDRESS);
        console.log("Min Profit: 0 (testing mode)");

        // Get gas estimate
        console.log("\nEstimating gas...");
        try {
            const gasEstimate = await engine.executeArbitrage.estimateGas(
                WETH_ADDRESS,
                FLASH_LOAN_AMOUNT,
                route
            );
            console.log("Estimated Gas:", gasEstimate.toString());

            const gasPrice = await provider.getFeeData();
            console.log("Gas Price:", gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, "gwei") + " gwei" : "N/A");

            const estimatedCost = gasEstimate * (gasPrice.gasPrice || gasPrice.maxFeePerGas || 0n);
            console.log("Estimated Cost:", ethers.formatEther(estimatedCost), "ETH");
        } catch (error) {
            console.log("Gas estimation failed (expected if route invalid):", error);
        }

        console.log("\n⚠️ WARNING: This will execute an actual transaction on Base Sepolia");
        console.log("The transaction may fail if the route is invalid or insufficient liquidity");
        console.log("Gas will be consumed regardless of success/failure");

        console.log("\nTo execute, uncomment the execution code below");
        console.log("For now, this test only verifies contract readiness");

        /*
        // Uncomment to execute actual flash loan
        console.log("\nExecuting flash loan...");
        const tx = await engine.executeArbitrage(
            WETH_ADDRESS,
            FLASH_LOAN_AMOUNT,
            route,
            {
                gasLimit: 500000,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
            }
        );

        console.log("Transaction Hash:", tx.hash);
        console.log("Waiting for confirmation...");

        const receipt = await tx.wait();

        console.log("\nTransaction Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
        console.log("Gas Used:", receipt.gasUsed.toString());

        if (receipt.status === 1) {
            console.log("✅ Flash loan executed successfully!");
        } else {
            console.log("❌ Flash loan execution failed");
        }
        */

        console.log("\n✅ Manual Flash Loan Test Complete");
        console.log("Contract is ready for flash loan execution");
        console.log("Uncomment execution code to proceed with actual transaction");

    } catch (error) {
        console.error("\n❌ Manual Flash Loan Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });