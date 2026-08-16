import { AbiCoder } from "ethers";
export function encodeRoute(plan) {
    return AbiCoder.defaultAbiCoder().encode([
<<<<<<< HEAD:archive/dist/planner/routeEncoder.js
        "tuple(tuple(address adapter,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 minAmountOut,bytes data,uint256 deadline)[] swaps,address profitToken,uint256 minProfit)"
=======
        "tuple(tuple(address adapter,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 minAmountOut,bytes data)[] swaps,address profitToken,uint256 minProfit)"
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995:dist/planner/routeEncoder.js
    ], [
        {
            swaps: plan.swaps.map((s) => ({
                adapter: s.adapter,
                tokenIn: s.tokenIn,
                tokenOut: s.tokenOut,
                fee: s.fee,
                amountIn: s.amountIn,
                minAmountOut: s.minAmountOut,
<<<<<<< HEAD:archive/dist/planner/routeEncoder.js
                data: s.data ?? "0x",
                deadline: s.deadline ?? 0
=======
                data: s.data ?? "0x"
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995:dist/planner/routeEncoder.js
            })),
            profitToken: plan.profitToken,
            minProfit: plan.minProfit
        }
    ]);
}
