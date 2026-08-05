import { quote } from "../dex/uniswapQuoter.js";
import { quoteAerodrome } from "../dex/aerodromeQuoter.js";
export async function validateLiquidity(tokenIn, tokenOut, amount) {
    try {
        await quote(tokenIn, tokenOut, amount);
        await quoteAerodrome(amount, tokenIn, tokenOut);
        return {
            available: true,
            maxAmount: amount
        };
    }
    catch {
        return {
            available: false,
            reason: "Quote failed",
            maxAmount: 0n
        };
    }
}
