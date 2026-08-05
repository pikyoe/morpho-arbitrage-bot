import hre from "hardhat";

async function main() {
    console.log("========================================");
    console.log("AUTHORIZATION TEST");
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

        // Load engine contract
        const engine = await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
            signer
        );

        console.log("\nEngine:", await engine.getAddress());

        // Check if signer is authorized
        const isAuthorized = await engine.authorizedCaller(signer.address);
        console.log("Wallet Authorized:", isAuthorized);

        if (!isAuthorized) {
            console.log("\n⚠️ Wallet is NOT authorized to call executeArbitrage");
            console.log("Attempting to authorize...");

            // Try to authorize the wallet
            try {
                const tx = await engine.setAuthorizedCaller(signer.address, true);
                console.log("Authorization TX:", tx.hash);

                const receipt = await tx.wait();
                console.log("Authorization Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");

                if (receipt.status === 1) {
                    console.log("✅ Wallet now authorized");
                }
            } catch (error) {
                console.log("Authorization failed:", error);
            }
        } else {
            console.log("✅ Wallet is already authorized");
        }

        // Check again
        const authorizedAfter = await engine.authorizedCaller(signer.address);
        console.log("Authorization Status After:", authorizedAfter);

        console.log("\n✅ Authorization Test Complete");

    } catch (error) {
        console.error("\n❌ Authorization Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });