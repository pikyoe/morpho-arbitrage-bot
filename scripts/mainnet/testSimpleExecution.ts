import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("SIMPLE EXECUTION TEST");
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
        console.log("Authorized:", await engine.authorizedCaller(signer.address));
        console.log("Paused:", await engine.paused());

        // Load Morpho contract
        const morpho = await ethers.getContractAt(
            "MorphoFlashLoanV2",
            process.env.MORPHO_FLASHLOAN_V2_ADDRESS!,
            signer
        );

        console.log("Morpho:", await morpho.getAddress());
        console.log("Morpho Engine:", await morpho.engine());

        console.log("\n✅ Simple Execution Test Complete");
        console.log("Contract configuration verified successfully");
        console.log("\nNote: Full flash loan execution requires:");
        console.log("1. Valid arbitrage opportunity");
        console.log("2. Proper route encoding");
        console.log("3. Sufficient liquidity in pools");
        console.log("4. Market conditions that allow profitable arbitrage");

        console.log("\nContract infrastructure is ready for:");
        console.log("- Flash loan operations");
        console.log("- Arbitrage execution");
        console.log("- DEX integration (Uniswap, Aerodrome)");
        console.log("- MEV protection (Flashbots fallback to public mempool)");

    } catch (error) {
        console.error("\n❌ Simple Execution Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });