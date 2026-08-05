import hre from "hardhat";
// Flashbots removed; this test is deprecated
console.log("Flashbots integration has been removed from this project. Test skipped.");
process.exit(0);

async function main() {
    console.log("========================================");
    console.log("FLASHBOTS INTEGRATION TEST");
    console.log("========================================");

    try {
        // Use the older but still working API
        const connection: any = await hre.network.connect();
        const { ethers } = connection;

        const provider = ethers.provider;
        const signer = await ethers.provider.getSigner();

        // Get network info
        const network = await provider.getNetwork();
        console.log("Network Name:", (hre.network as any).name || "unknown");
        console.log("Chain ID:", network.chainId.toString());
        console.log("Wallet:", await signer.getAddress());

        // Check if engine address is set
        if (!process.env.ARBITRAGE_ENGINE_V2_ADDRESS) {
            throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS not set in environment variables");
        }

        console.log("Engine:", process.env.ARBITRAGE_ENGINE_V2_ADDRESS);

        const engine = await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
            signer
        );

        const flashbotsConfig: FlashbotsConfig = {
            enabled: process.env.FLASHBOTS_ENABLED === 'true',
            relayUrl: process.env.FLASHBOTS_RELAY_URL || 'https://relay.flashbots.net',
            minProfitThreshold: parseFloat(process.env.FLASHBOTS_MIN_PROFIT_USD || '10.0'),
            maxRetries: parseInt(process.env.FLASHBOTS_MAX_RETRIES || '3'),
            fallbackToPublic: process.env.FLASHBOTS_FALLBACK_TO_PUBLIC !== 'false'
        };

        console.log("\nFlashbots Configuration:");
        console.log(JSON.stringify(flashbotsConfig, null, 2));

        console.log("\nInitializing Flashbots Executor...");
        const flashbotsExecutor = new FlashbotsExecutor(
            engine,
            provider,
            signer,
            flashbotsConfig
        );

        // Wait a bit for async initialization
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log("\nFlashbots Status:");
        console.log("Available:", flashbotsExecutor.isFlashbotsAvailable() ? "Yes" : "No");
        console.log("Current Config:", JSON.stringify(flashbotsExecutor.getConfig(), null, 2));

        console.log("\nTesting dynamic configuration update...");
        flashbotsExecutor.updateConfig({ minProfitThreshold: 15.0 });
        console.log("Updated Config:", JSON.stringify(flashbotsExecutor.getConfig(), null, 2));

        console.log("\n========================================");
        console.log("FLASHBOTS TEST COMPLETED SUCCESSFULLY");
        console.log("========================================");

    } catch (error) {
        console.error("\n❌ FLASHBOTS TEST FAILED:");
        console.error(error);
        console.error("\nTroubleshooting:");
        console.error("1. Check if ARBITRAGE_ENGINE_V2_ADDRESS is set in .env.sepolia");
        console.error("2. Verify wallet has sufficient gas");
        console.error("3. Check network connectivity");
        console.error("4. Ensure Flashbots dependency is installed");
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });