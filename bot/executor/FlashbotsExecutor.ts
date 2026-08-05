import { Contract, ContractTransactionReceipt, ethers } from "ethers";

export interface FlashbotsConfig {
    enabled: boolean;
    relayUrl: string;
    minProfitThreshold: number;
    maxRetries: number;
    fallbackToPublic: boolean;
}

export interface FlashbotsExecutionResult {
    success: boolean;
    method: 'flashbots' | 'public';
    receipt?: ContractTransactionReceipt;
    error?: string;
    bundleHash?: string;
}

export class FlashbotsExecutor {
    private flashbotsProvider: any = null;
    private config: FlashbotsConfig;

    constructor(
        private readonly engine: Contract,
        private readonly provider: any,
        private readonly signer: any,
        config?: Partial<FlashbotsConfig>
    ) {
        this.config = {
            enabled: config?.enabled ?? true,
            relayUrl: config?.relayUrl ?? 'https://relay.flashbots.net',
            minProfitThreshold: config?.minProfitThreshold ?? 10.0,
            maxRetries: config?.maxRetries ?? 3,
            fallbackToPublic: config?.fallbackToPublic ?? true
        };

        if (this.config.enabled) {
            this.initializeFlashbots();
        }
    }

    private async initializeFlashbots() {
        try {
            // Check if we're on a supported network
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            // Flashbots primarily supports Ethereum mainnet (1)
            // For Base Sepolia (84532) and other L2s, we skip Flashbots
            if (chainId !== 1) {
                console.log(`Network chain ID ${chainId} is not supported by Flashbots (mainnet only)`);
                console.log('Falling back to public mempool execution');
                this.config.enabled = false;
                return;
            }

            const { FlashbotsBundleProvider } = await import('@flashbots/ethers-provider-bundle');
            this.flashbotsProvider = await FlashbotsBundleProvider.create(
                this.provider,
                this.signer,
                this.config.relayUrl
            );
            console.log('Flashbots provider initialized');
        } catch (error) {
            console.warn('Failed to initialize Flashbots provider:', error);
            console.log('Falling back to public mempool execution');
            this.config.enabled = false;
        }
    }

    async execute(
        token: string,
        amount: bigint,
        route: any,
        profitUSD?: number
    ): Promise<FlashbotsExecutionResult> {
        console.log();
        console.log("MEV PROTECTED EXECUTION");

        const useFlashbots = this.shouldUseFlashbots(profitUSD);

        if (useFlashbots && this.flashbotsProvider) {
            console.log("Using Flashbots for MEV protection");
            return await this.executeWithFlashbots(token, amount, route);
        } else {
            console.log("Using public mempool");
            return await this.executeWithPublicMempool(token, amount, route);
        }
    }

    private shouldUseFlashbots(profitUSD?: number): boolean {
        if (!this.config.enabled || !this.flashbotsProvider) {
            return false;
        }

        if (profitUSD !== undefined && profitUSD < this.config.minProfitThreshold) {
            console.log(`Profit $${profitUSD.toFixed(2)} below threshold $${this.config.minProfitThreshold}, using public mempool`);
            return false;
        }

        return true;
    }

    private async executeWithFlashbots(
        token: string,
        amount: bigint,
        route: any
    ): Promise<FlashbotsExecutionResult> {
        try {
            console.log("Creating Flashbots bundle...");

            const blockNumber = await this.provider.getBlockNumber();
            console.log(`Current block: ${blockNumber}`);

            const txData = await this.engine.executeArbitrage.populateTransaction(
                token,
                amount,
                route
            );

            const signedTx = await this.signer.signTransaction(txData);

            const bundle = [
                {
                    signedTransaction: signedTx,
                    signer: this.signer.address
                }
            ];

            console.log("Sending bundle to Flashbots relay...");

            const simulation = await this.flashbotsProvider.simulate(
                bundle,
                blockNumber + 1
            );

            if (simulation.number(0) === 0) {
                console.error("Flashbots simulation failed");
                throw new Error("Flashbots simulation failed");
            }

            console.log("Simulation successful");

            const bundleSubmission = await this.flashbotsProvider.sendBundle(
                bundle,
                blockNumber + 1
            );

            console.log(`Bundle hash: ${bundleSubmission.bundleHash}`);

            const receipt = await this.waitForBundleExecution(
                bundleSubmission.bundleHash,
                blockNumber + 1
            );

            if (!receipt) {
                throw new Error("Bundle execution timeout");
            }

            console.log("Flashbots execution successful");
            console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

            return {
                success: true,
                method: 'flashbots',
                receipt,
                bundleHash: bundleSubmission.bundleHash
            };

        } catch (error) {
            console.error("Flashbots execution failed:", error);

            if (this.config.fallbackToPublic) {
                console.log("Falling back to public mempool...");
                return await this.executeWithPublicMempool(token, amount, route);
            }

            return {
                success: false,
                method: 'flashbots',
                error: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }

    private async executeWithPublicMempool(
        token: string,
        amount: bigint,
        route: any
    ): Promise<FlashbotsExecutionResult> {
        try {
            const gasConfig = await this.getDynamicGasConfig();

            const tx = await this.engine.executeArbitrage(
                token,
                amount,
                route,
                {
                    maxFeePerGas: gasConfig.maxFeePerGas,
                    maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
                    gasLimit: gasConfig.gasLimit
                }
            );

            console.log("Tx:", tx.hash);
            console.log("Waiting for confirmation...");

            const receipt = await tx.wait();

            if (!receipt || receipt.status !== 1) {
                throw new Error("Transaction reverted");
            }

            console.log("Public mempool execution successful");
            console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

            return {
                success: true,
                method: 'public',
                receipt
            };

        } catch (error) {
            console.error("Public mempool execution failed:", error);

            return {
                success: false,
                method: 'public',
                error: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }

    private async getDynamicGasConfig() {
        try {
            const feeData = await this.provider.getFeeData();

            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                const maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
                const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;

                return {
                    maxFeePerGas,
                    maxPriorityFeePerGas,
                    gasLimit: 650000n
                };
            }

            if (feeData.gasPrice) {
                const gasPrice = (feeData.gasPrice * 120n) / 100n;
                return {
                    maxFeePerGas: gasPrice,
                    maxPriorityFeePerGas: gasPrice,
                    gasLimit: 650000n
                };
            }

            return {
                maxFeePerGas: ethers.parseUnits("2", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
                gasLimit: 650000n
            };
        } catch (error) {
            console.error("Failed to get gas config, using defaults");
            return {
                maxFeePerGas: ethers.parseUnits("2", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
                gasLimit: 650000n
            };
        }
    }

    private async waitForBundleExecution(
        bundleHash: string,
        targetBlock: number,
        timeout: number = 30000
    ): Promise<ContractTransactionReceipt | null> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const receipts = await this.flashbotsProvider.getBundleReceipts(
                    bundleHash,
                    targetBlock
                );

                if (receipts && receipts.length > 0) {
                    return receipts[0];
                }

                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock > targetBlock + 5) {
                    console.log("Bundle not included in expected blocks");
                    return null;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error("Error checking bundle status:", error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return null;
    }

    updateConfig(config: Partial<FlashbotsConfig>) {
        this.config = { ...this.config, ...config };
        console.log("Flashbots config updated:", this.config);
    }

    getConfig(): FlashbotsConfig {
        return { ...this.config };
    }

    isFlashbotsAvailable(): boolean {
        return this.config.enabled && this.flashbotsProvider !== null;
    }
}