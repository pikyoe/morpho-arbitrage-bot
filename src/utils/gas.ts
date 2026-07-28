import { provider } from "../config/provider.js";

export interface GasInfo {

    gasPrice: bigint;

    maxFeePerGas: bigint;

    maxPriorityFeePerGas: bigint;

}

export async function getGasInfo(): Promise<GasInfo> {

    const fee =
        await provider.getFeeData();

    return {

        gasPrice:
            fee.gasPrice ?? 0n,

        maxFeePerGas:
            fee.maxFeePerGas ?? 0n,

        maxPriorityFeePerGas:
            fee.maxPriorityFeePerGas ?? 0n

    };

}