import { WebSocketProvider, JsonRpcProvider } from "ethers";
import { setTimeout as sleep } from "timers/promises";

async function testWebSocket() {
    console.log("Testing WebSocket Connection");
    console.log("==============================\n");

    const wsUrl = process.env.BASE_WS_RPC_URL;
    const httpUrl = process.env.BASE_RPC_URL;

    if (!wsUrl) {
        console.error("❌ BASE_WS_RPC_URL not set in environment");
        return;
    }

    console.log("WebSocket URL:", wsUrl);
    console.log("HTTP URL:", httpUrl);
    console.log();

    // Test WebSocket connection
    console.log("Testing WebSocket connection...");
    let wsProvider: WebSocketProvider | null = null;

    try {
        wsProvider = new WebSocketProvider(wsUrl);
        
        // Test connection
        const network = await wsProvider.getNetwork();
        console.log("✅ WebSocket connected to", network.name, "(chainId:", network.chainId + ")");
        
        // Get current block
        const blockNumber = await wsProvider.getBlockNumber();
        console.log("✅ Current block:", blockNumber);
        
        // Test block event listening
        console.log("\n📡 Listening for new blocks (10 seconds)...");
        let blockCount = 0;
        
        const listener = (blockNum: number) => {
            blockCount++;
            console.log(`🔔 Block ${blockNum} received (Total: ${blockCount})`);
        };
        
        wsProvider.on('block', listener);
        
        // Wait for 10 seconds to see some blocks
        await sleep(10000);
        
        wsProvider.off('block', listener);
        console.log(`\n✅ Received ${blockCount} blocks in 10 seconds`);
        console.log(`✅ Block rate: ${(blockCount / 10 * 60).toFixed(2)} blocks/minute`);
        
        // Cleanup
        await wsProvider.destroy();
        console.log("\n✅ WebSocket connection closed successfully");
        
    } catch (error) {
        console.error("❌ WebSocket test failed:", error);
        console.log("\nFalling back to HTTP test...");
        
        // Test HTTP fallback
        try {
            const httpProvider = new JsonRpcProvider(httpUrl!);
            const network = await httpProvider.getNetwork();
            console.log("✅ HTTP fallback connected to", network.name, "(chainId:", network.chainId + ")");
            const blockNumber = await httpProvider.getBlockNumber();
            console.log("✅ Current block:", blockNumber);
        } catch (httpError) {
            console.error("❌ HTTP fallback also failed:", httpError);
        }
        
        if (wsProvider) {
            try {
                await wsProvider.destroy();
            } catch (destroyError) {
                console.error("Error closing WebSocket:", destroyError);
            }
        }
    }
}

testWebSocket().catch(console.error);
