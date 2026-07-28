import { provider } from "../config/provider.js";
export async function getGasInfo() {
    const fee = await provider.getFeeData();
    return {
        gasPrice: fee.gasPrice ?? 0n,
        maxFeePerGas: fee.maxFeePerGas ?? 0n,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n
    };
}
