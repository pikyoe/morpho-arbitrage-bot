import { AbiCoder } from "ethers";
export function encodeRoute(plan) {
    return AbiCoder
        .defaultAbiCoder()
        .encode([
        "tuple(tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[] swaps,address profitToken,uint256 minProfit)"
    ], [
        {
            swaps: plan.swaps.map((s) => ({
                adapter: s.adapter,
                tokenIn: s.tokenIn,
                tokenOut: s.tokenOut,
                amountIn: s.amountIn,
                minAmountOut: s.minAmountOut,
                data: "0x"
            })),
            profitToken: plan.flashToken,
            minProfit: plan.expectedProfit
        }
    ]);
}
