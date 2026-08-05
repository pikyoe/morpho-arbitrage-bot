import { formatEther } from "ethers";

export interface GasEstimateInput {

    // Gross profit sebelum biaya
    grossProfitUSD: number;

    // Estimasi gas yang akan dipakai
    gasLimit: bigint;

    // Gas price (wei)
    gasPrice: bigint;

    // Harga ETH dalam USD
    ethPriceUSD: number;

    // Flash loan fee (USD)
    flashLoanFeeUSD?: number;

    // Safety buffer (USD)
    safetyBufferUSD?: number;

    // Max fee per gas for EIP-1559 (optional)
    maxFeePerGas?: bigint;

    // Max priority fee per gas for EIP-1559 (optional)
    maxPriorityFeePerGas?: bigint;
}

export interface GasEstimateResult {

    gasLimit: bigint;

    gasPrice: bigint;

    gasCostWei: bigint;

    gasCostETH: number;

    gasCostUSD: number;

    grossProfitUSD: number;

    flashLoanFeeUSD: number;

    safetyBufferUSD: number;

    netProfitUSD: number;

    gasRatio: number;

    profitable: boolean;

    // EIP-1559 fields
    maxFeePerGas?: bigint;

    maxPriorityFeePerGas?: bigint;

    usesEIP1559: boolean;
}

export class GasEstimator {

    static estimate(
        input: GasEstimateInput
    ): GasEstimateResult {

        const flashLoanFee =
            input.flashLoanFeeUSD ?? 0;

        const safetyBuffer =
            input.safetyBufferUSD ?? 0;

        // Use maxFeePerGas if available (EIP-1559), otherwise use gasPrice
        const effectiveGasPrice = input.maxFeePerGas || input.gasPrice;

        const gasCostWei =
            input.gasLimit *
            effectiveGasPrice;

        const gasCostETH =
            Number(
                formatEther(
                    gasCostWei
                )
            );

        const gasCostUSD =
            gasCostETH *
            input.ethPriceUSD;

        const netProfitUSD =
            input.grossProfitUSD
            -
            gasCostUSD
            -
            flashLoanFee
            -
            safetyBuffer;

        const gasRatio =
            input.grossProfitUSD === 0
                ? 0
                :
                gasCostUSD /
                input.grossProfitUSD;

        const usesEIP1559 = !!(input.maxFeePerGas && input.maxPriorityFeePerGas);

        return {

            gasLimit:
                input.gasLimit,

            gasPrice:
                input.gasPrice,

            gasCostWei,

            gasCostETH,

            gasCostUSD,

            grossProfitUSD:
                input.grossProfitUSD,

            flashLoanFeeUSD:
                flashLoanFee,

            safetyBufferUSD:
                safetyBuffer,

            netProfitUSD,

            gasRatio,

            profitable:
                netProfitUSD > 0,

            maxFeePerGas: input.maxFeePerGas,

            maxPriorityFeePerGas: input.maxPriorityFeePerGas,

            usesEIP1559

        };

    }

    // Check if gas costs are too high relative to profit
    static isGasTooHigh(gasRatio: number, threshold: number = 0.8): boolean {
        return gasRatio > threshold;
    }

    // Calculate optimal gas limit based on complexity
    static calculateOptimalGasLimit(swaps: number, baseLimit: bigint = 300000n): bigint {
        const perSwapGas = 150000n; // Additional gas per swap
        return baseLimit + (BigInt(swaps) * perSwapGas);
    }

}

