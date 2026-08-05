import { Contract, ContractTransactionReceipt, ethers } from "ethers";

export interface GasConfig {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
}

export class FlashLoanExecutor {

    constructor(
        private readonly engine: Contract
    ) {}

    private async getDynamicGasPrice(provider: any): Promise<GasConfig> {
        try {
            const feeData = await provider.getFeeData();

            // For EIP-1559 networks (like Base)
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                // Add 20% buffer to ensure transaction goes through
                const maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
                const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;

                return {
                    maxFeePerGas,
                    maxPriorityFeePerGas
                };
            }

            // Fallback to legacy gas price
            if (feeData.gasPrice) {
                const gasPrice = (feeData.gasPrice * 120n) / 100n;
                return {
                    maxFeePerGas: gasPrice,
                    maxPriorityFeePerGas: gasPrice
                };
            }

            // Ultimate fallback
            return {
                maxFeePerGas: ethers.parseUnits("2", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
            };
        } catch (error) {
            console.error("Failed to get dynamic gas price, using defaults:", error);
            return {
                maxFeePerGas: ethers.parseUnits("2", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
            };
        }
    }

    async execute(
        token: string,
        amount: bigint,
        route: any,
        customGasConfig?: GasConfig
    ): Promise<ContractTransactionReceipt> {

        console.log();
        console.log("====================================");
        console.log("EXECUTING FLASH LOAN");
        console.log("====================================");

        try {
            // Get dynamic gas pricing
            const gasConfig = customGasConfig || await this.getDynamicGasPrice(this.engine.runner?.provider);

            console.log("Gas Config:");
            console.log("Max Fee Per Gas:", ethers.formatUnits(gasConfig.maxFeePerGas || 0n, "gwei"), "gwei");
            console.log("Max Priority Fee:", ethers.formatUnits(gasConfig.maxPriorityFeePerGas || 0n, "gwei"), "gwei");

            // Estimate gas for the transaction
            let gasLimit: bigint;
            try {
                gasLimit = await this.engine.executeArbitrage.estimateGas(
                    token,
                    amount,
                    route
                );
                // Add 20% buffer to gas limit
                gasLimit = (gasLimit * 120n) / 100n;
                console.log("Estimated Gas Limit:", gasLimit.toString());
            } catch (estimateError) {
                console.warn("Gas estimation failed, using default limit:", estimateError);
                gasLimit = 650000n; // Fallback to default
            }

            // Execute transaction with dynamic gas settings
            const tx = await this.engine.executeArbitrage(
                token,
                amount,
                route,
                {
                    maxFeePerGas: gasConfig.maxFeePerGas,
                    maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
                    gasLimit: gasConfig.gasLimit || gasLimit
                }
            );

            console.log("Tx:", tx.hash);
            console.log("Waiting for confirmation...");

            const receipt = await tx.wait();

            if (!receipt || receipt.status !== 1) {
                throw new Error("Flash loan transaction reverted.");
            }

            console.log("Gas Used :", receipt.gasUsed.toString());
            console.log("Effective Gas Price:", receipt.gasPrice ? ethers.formatUnits(receipt.gasPrice, "gwei") + " gwei" : "N/A");
            console.log("Block    :", receipt.blockNumber);
            console.log("Gas Cost  :", ethers.formatEther((receipt.gasUsed || 0n) * (receipt.gasPrice || 0n)), "ETH");

            return receipt;
        } catch (error: any) {
            console.error("Transaction execution failed:", error.message);

            // Provide more specific error information
            if (error.message.includes("insufficient funds")) {
                throw new Error("Insufficient funds for gas + value");
            }
            if (error.message.includes("nonce")) {
                throw new Error("Nonce error - transaction with same nonce already pending");
            }
            if (error.message.includes("gas")) {
                throw new Error("Gas related error - possibly gas limit too low or gas price too high");
            }

            throw error;
        }
    }
}