import { Contract } from "ethers";
import { provider } from "../../config/provider.js";
import { ADDRESSES } from "../../config/addresses.js";
import { UniswapQuoterV2ABI } from "./abi.js";
import { UNISWAP_FEE } from "./constants.js";
const quoter = new Contract(ADDRESSES.UNISWAP_QUOTER, UniswapQuoterV2ABI, provider);
export async function quote(tokenIn, tokenOut, amountIn) {
    const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee: UNISWAP_FEE,
        sqrtPriceLimitX96: 0
    });
    return result.amountOut;
}
