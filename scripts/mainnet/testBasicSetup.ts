import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("BASIC SETUP TEST");
    console.log("========================================");

    try {
        const connection: any = await hre.network.connect();
        const { ethers } = connection;

        const provider = ethers.provider;
        const [signer] = await ethers.getSigners();

        // Get network info
        const network = await provider.getNetwork();
        console.log("Network Name:", (hre.network as any).name || "unknown");
        console.log("Chain ID:", network.chainId.toString());
        console.log("Wallet:", signer.address);

        // Check wallet balance
        const balance = await provider.getBalance(signer.address);
        console.log("Wallet Balance:", ethers.formatEther(balance), "ETH");

        // Check environment variables
        console.log("\nEnvironment Variables:");
        console.log("ARBITRAGE_ENGINE_V2_ADDRESS:", process.env.ARBITRAGE_ENGINE_V2_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("MORPHO_FLASHLOAN_V2_ADDRESS:", process.env.MORPHO_FLASHLOAN_V2_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("UNISWAP_ADAPTER_V2_ADDRESS:", process.env.UNISWAP_ADAPTER_V2_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("UNISWAP_FACTORY_ADDRESS:", process.env.UNISWAP_FACTORY_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("AERODROME_FACTORY_ADDRESS:", process.env.AERODROME_FACTORY_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("WETH_ADDRESS:", process.env.WETH_ADDRESS ? "✅ Set" : "❌ Missing");
        console.log("USDC_ADDRESS:", process.env.USDC_ADDRESS ? "✅ Set" : "❌ Missing");

        // Test basic contract connection
        if (process.env.ARBITRAGE_ENGINE_V2_ADDRESS) {
            console.log("\nTesting Contract Connection:");
            try {
                const engine = await ethers.getContractAt(
                    "ArbitrageEngineV2",
                    process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
                    signer
                );
                console.log("Engine Address:", await engine.getAddress());
                console.log("✅ Engine contract connected");
            } catch (error) {
                console.log("❌ Engine contract connection failed:", error);
            }
        }

        if (process.env.MORPHO_FLASHLOAN_V2_ADDRESS) {
            try {
                const morpho = await ethers.getContractAt(
                    "MorphoFlashLoanV2",
                    process.env.MORPHO_FLASHLOAN_V2_ADDRESS!,
                    signer
                );
                console.log("Morpho Address:", await morpho.getAddress());
                console.log("✅ Morpho contract connected");
            } catch (error) {
                console.log("❌ Morpho contract connection failed:", error);
            }
        }

        // Test RPC connectivity
        console.log("\nTesting RPC Connectivity:");
        const blockNumber = await provider.getBlockNumber();
        console.log("Current Block:", blockNumber);
        console.log("✅ RPC connectivity OK");

        console.log("\n========================================");
        console.log("BASIC SETUP TEST COMPLETED");
        console.log("========================================");

    } catch (error) {
        console.error("\n❌ BASIC SETUP TEST FAILED:");
        console.error(error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });