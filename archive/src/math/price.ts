import { formatUnits } from "ethers";

const Q96 = 2n ** 96n;

export function sqrtPriceToPrice(

    sqrtPriceX96: bigint,

    decimals0: number,

    decimals1: number

): number {

    const numerator =
        Number(sqrtPriceX96 * sqrtPriceX96);

    const denominator =
        Number(Q96 * Q96);

    const ratio =
        numerator / denominator;

    return ratio *
        Math.pow(
            10,
            decimals0 - decimals1
        );

}