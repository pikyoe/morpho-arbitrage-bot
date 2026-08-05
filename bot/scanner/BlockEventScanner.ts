import { ethers } from "ethers";
import { OptimizedMarketPairScanner, ArbitrageCandidate } from "./OptimizedMarketPairScanner.js";

export interface BlockEventScannerConfig {
    enabled: boolean;
    onBlock?: (blockNumber: number) => Promise<void>;
    onError?: (error: Error) => void;
}

export class BlockEventScanner {
    private provider: ethers.Provider;
    private scanner: OptimizedMarketPairScanner;
    private config: BlockEventScannerConfig;
    private isRunning: boolean = false;
    private blockListener: ((blockNumber: number) => void) | null = null;

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
        console.log("Starting block event scanner...");

        // Set up block listener
        this.blockListener = async (blockNumber: number) => {
            try {
                console.log(`New block: ${blockNumber}`);
                
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
        console.log("Subscribed to block events");
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

        console.log("Block event scanner stopped");
    }

    isScanning(): boolean {
        return this.isRunning;
    }

    async scanOnce(tokenA: string, tokenB: string, amount?: bigint): Promise<ArbitrageCandidate[]> {
        return await this.scanner.scan(tokenA, tokenB, amount);
    }
}