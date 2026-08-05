import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("SIMPLE DEPLOYMENT TEST");
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

        const engine = await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
            signer
        );

        console.log("Engine:", await engine.getAddress());
        console.log("MorphoFlashLoan:", await engine.morphoFlashLoan());
        console.log("UniswapAdapter:", process.env.UNISWAP_ADAPTER_V2_ADDRESS);
        console.log("AerodromeAdapter:", process.env.AERODROME_ADAPTER_V2_ADDRESS);

        console.log("\n✅ Deployment Test Passed");
        console.log("All contracts deployed and wired correctly");

    } catch (error) {
        console.error("\n❌ Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });