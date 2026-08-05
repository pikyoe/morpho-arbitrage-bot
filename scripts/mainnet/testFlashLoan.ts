import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("FLASH LOAN TEST");
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

        // Load contracts
        const engine = await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
            signer
        );

        const morpho = await ethers.getContractAt(
            "MorphoFlashLoanV2",
            process.env.MORPHO_FLASHLOAN_V2_ADDRESS!,
            signer
        );

        console.log("\nContracts:");
        console.log("Engine:", await engine.getAddress());
        console.log("MorphoFlashLoan:", await morpho.getAddress());

        // Test flash loan with small amount
        const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
        const FLASH_LOAN_AMOUNT = ethers.parseEther("0.01"); // 0.01 WETH

        console.log("\nFlash Loan Parameters:");
        console.log("Token:", WETH_ADDRESS);
        console.log("Amount:", ethers.formatEther(FLASH_LOAN_AMOUNT), "WETH");

        // Check engine configuration
        console.log("\nEngine Configuration:");
        console.log("MorphoFlashLoan:", await engine.morphoFlashLoan());
        console.log("ProfitReceiver:", await engine.profitReceiver());
        console.log("Paused:", await engine.paused());

        // Morpho configuration
        console.log("\nMorpho Configuration:");
        console.log("Engine:", await morpho.engine());
        console.log("Paused:", await morpho.paused());

        console.log("\n⚠️ Note: Full arbitrage test requires valid route and market conditions");
        console.log("This test verifies contract connectivity and configuration");

        console.log("\n✅ Flash Loan Test Setup Complete");
        console.log("Contracts are ready for flash loan operations");

    } catch (error) {
        console.error("\n❌ Flash Loan Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });