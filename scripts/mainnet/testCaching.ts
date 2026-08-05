import hre from "hardhat";
import { RPCCache, gasPriceCache, poolStateCache, priceCache } from "../../bot/cache/RPCCache.js";
import { RateLimiter, rpcRateLimiter, quoteRateLimiter, stateRateLimiter } from "../../bot/utils/RateLimiter.js";

async function main() {
    console.log("========================================");
    console.log("CACHING AND RATE LIMITING TEST");
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

        // Test RPC Cache
        console.log("\n========================================");
        console.log("RPC CACHE TEST");
        console.log("========================================");

        const cacheKey = "gas_price";
        const testValue = { price: "1000000000", timestamp: Date.now() };

        console.log("Setting cache value...");
        gasPriceCache.set(cacheKey, testValue, 5000);

        console.log("Retrieving cache value...");
        const cached = gasPriceCache.get(cacheKey);
        console.log("Cached value:", cached);

        console.log("Waiting 6 seconds (TTL expired)...");
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log("Retrieving after TTL expiration...");
        const expired = gasPriceCache.get(cacheKey);
        console.log("Expired value:", expired || "null (correctly expired)");

        console.log("Cache size:", gasPriceCache.size());

        // Test Rate Limiter
        console.log("\n========================================");
        console.log("RATE LIMITER TEST");
        console.log("========================================");

        console.log("Testing rate limiter (20 requests per second)...");
        console.log("Remaining:", rpcRateLimiter.getRemaining());

        console.log("Making 25 rapid requests...");
        for (let i = 0; i < 25; i++) {
            await rpcRateLimiter.wait();
            console.log("Request " + (i + 1) + ": Remaining = " + rpcRateLimiter.getRemaining());
        }

        console.log("\n========================================");
        console.log("CACHING AND RATE LIMITING TEST COMPLETED");
        console.log("========================================");

        console.log("\nConfiguration:");
        console.log("- Scan Interval: 5000ms (5 seconds)");
        console.log("- Max Pools: 30");
        console.log("- Gas Price Cache TTL: 10 seconds");
        console.log("- Pool State Cache TTL: 5 seconds");
        console.log("- Price Cache TTL: 3 seconds");
        console.log("- RPC Rate Limit: 20 requests per second");
        console.log("- Quote Rate Limit: 10 requests per second");
        console.log("- State Rate Limit: 15 requests per second");

    } catch (error) {
        console.error("\nCaching and Rate Limiting Test Failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });