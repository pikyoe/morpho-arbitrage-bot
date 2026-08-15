import { ethers } from "ethers";
import { OptimizedMarketPairScanner, ArbitrageCandidate } from "./OptimizedMarketPairScanner.js";

export interface BlockEventScannerConfig {
    enabled: boolean;
    onBlock?: (blockNumber: number) => Promise<void>;
    onError?: (error: Error) => void;
    skipBlocks?: number; // Skip N blocks between scans to reduce load (0 = every block)
}

export class BlockEventScanner {
    private provider: ethers.Provider;
    private scanner: OptimizedMarketPairScanner;
    private config: BlockEventScannerConfig;
    private isRunning: boolean = false;
    private blockListener: ((blockNumber: number) => void) | null = null;
    private blockCount: number = 0;
    private processedBlockCount: number = 0;
    private startTime: number = 0;
    private lastBlockTime: number = 0;

    constructor(
        provider: ethers.Provider,
        scanner: OptimizedMarketPairScanner,
        config: BlockEventScannerConfig
    ) {
        this.provider = provider;
        this.scanner = scanner;
        this.config = config;
    }

    async start(tokenA: string, tokenB: string, amount?: bigint): Promise<void> {
        if (!this.config.enabled) {
            console.log("Block event scanning is disabled");
            return;
        }

        if (this.isRunning) {
            console.warn("Block event scanner is already running");
            return;
        }

        this.isRunning = true;
        this.blockCount = 0;
        this.startTime = Date.now();
        console.log("Starting block event scanner...");
        console.log("Mode: Real-time WebSocket-based block monitoring");

        // Set up block listener
        this.blockListener = async (blockNumber: number) => {
            try {
                this.blockCount++;
                this.lastBlockTime = Date.now();
                const elapsed = this.lastBlockTime - this.startTime;
                const blocksPerMinute = (this.blockCount / (elapsed / 60000)).toFixed(2);
                
                const skipBlocks = this.config.skipBlocks || 0;
                
                // Skip blocks if configured
                if (skipBlocks > 0 && this.blockCount % (skipBlocks + 1) !== 0) {
                    console.log(`🔔 New block: ${blockNumber} (skipped - Total: ${this.blockCount}, Rate: ${blocksPerMinute}/min)`);
                    return;
                }
                
                this.processedBlockCount++;
                console.log(`🔔 New block: ${blockNumber} (Processing - Total: ${this.blockCount}, Processed: ${this.processedBlockCount}, Rate: ${blocksPerMinute}/min)`);
                
                // Execute the scan on new block
                if (this.config.onBlock) {
                    await this.config.onBlock(blockNumber);
                } else {
                    // Default behavior: scan on each block
                    const candidates = await this.scanner.scan(tokenA, tokenB, amount);
                    console.log(`Found ${candidates.length} candidates in block ${blockNumber}`);
                }
            } catch (error) {
                console.error(`Error processing block ${blockNumber}:`, error);
                if (this.config.onError) {
                    this.config.onError(error instanceof Error ? error : new Error(String(error)));
                }
            }
        };

        // Subscribe to new blocks
        this.provider.on('block', this.blockListener);
        console.log("✅ Subscribed to block events");
        console.log("📊 Monitoring for arbitrage opportunities in real-time...");
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        console.log("Stopping block event scanner...");
        this.isRunning = false;

        if (this.blockListener) {
            this.provider.off('block', this.blockListener);
            this.blockListener = null;
        }

        // Log statistics
        const elapsed = Date.now() - this.startTime;
        const blocksPerMinute = (this.blockCount / (elapsed / 60000)).toFixed(2);
        const processedPerMinute = (this.processedBlockCount / (elapsed / 60000)).toFixed(2);
        console.log("\n📊 Block Event Scanner Statistics:");
        console.log(`  Total blocks received: ${this.blockCount}`);
        console.log(`  Total blocks processed: ${this.processedBlockCount}`);
        console.log(`  Runtime: ${(elapsed / 1000).toFixed(2)} seconds`);
        console.log(`  Average block rate: ${blocksPerMinute}/min`);
        console.log(`  Average processed rate: ${processedPerMinute}/min`);
        console.log("Block event scanner stopped");
    }

    isScanning(): boolean {
        return this.isRunning;
    }

    async scanOnce(tokenA: string, tokenB: string, amount?: bigint): Promise<ArbitrageCandidate[]> {
        return await this.scanner.scan(tokenA, tokenB, amount);
    }
}