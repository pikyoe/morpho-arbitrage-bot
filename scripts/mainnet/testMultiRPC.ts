import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { getMultiRPCManager } from "../../bot/utils/MultiRPCManager.js";

async function main() {
    console.log("Testing Multi-RPC Configuration");
    console.log("=====================================\n");

    // Load environment
    loadEnvForNetwork(hre);

    // Get RPC URLs from environment
    const rpc1 = process.env.BASE_RPC_URL_1 || process.env.BASE_RPC_URL;
    const rpc2 = process.env.BASE_RPC_URL_2 || "";

    console.log("RPC Configuration:");
    console.log("RPC 1:", rpc1.substring(0, 30) + "...");
    console.log("RPC 2:", rpc2 ? rpc2.substring(0, 30) + "..." : "Not configured");
    console.log();

    // Initialize multi-RPC manager
    const multiRPCManager = getMultiRPCManager();
    console.log("Multi-RPC Manager Stats:", multiRPCManager.getStats());
    console.log();

    // Test providers
    console.log("Testing Providers:");
    const providers = multiRPCManager.getAllProviders();
    
    for (let i = 0; i < providers.length; i++) {
        console.log(`\nProvider ${i}:`);
        try {
            const blockNumber = await providers[i].getBlockNumber();
            console.log(`  ✅ Block Number: ${blockNumber}`);
            
            const network = await providers[i].getNetwork();
            console.log(`  ✅ Chain ID: ${network.chainId}`);
            console.log(`  ✅ Network Name: ${network.name}`);
            
            multiRPCManager.recordSuccess(i);
        } catch (error) {
            console.log(`  ❌ Error: ${error}`);
            multiRPCManager.recordFailure(i);
        }
    }

    console.log("\nFinal Stats:", multiRPCManager.getStats());
    console.log("\nTest Complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });