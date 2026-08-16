import { AbiCoder } from "ethers";
import type { Route } from "../types/Route.js";

export function encodeRoute(plan: Route): string {
    return AbiCoder.defaultAbiCoder().encode(
        [
            "tuple(tuple(address adapter,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 minAmountOut,bytes data,uint256 deadline)[] swaps,address profitToken,uint256 minProfit)"
        ],
        [
            {
                swaps: plan.swaps.map((s) => ({
                    adapter: s.adapter,
                    tokenIn: s.tokenIn,
                    tokenOut: s.tokenOut,
                    fee: s.fee,
                    amountIn: s.amountIn,
                    minAmountOut: s.minAmountOut,
                    data: s.data ?? "0x",
                    deadline: s.deadline ?? 0
                })),
                profitToken: plan.profitToken,
                minProfit: plan.minProfit
            }
        ]
    );
}
