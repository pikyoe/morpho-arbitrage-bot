import { getGasInfo } from "./gas.js";

const GAS_LIMIT = 450000n;

export async function estimateGasETH(): Promise<bigint> {

    const gas =
        await getGasInfo();

    return (
        gas.maxFeePerGas *
        GAS_LIMIT
    );

}