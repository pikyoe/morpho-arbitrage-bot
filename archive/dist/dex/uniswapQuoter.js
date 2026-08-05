import { Contract } from "ethers";
import { provider } from "../config/provider";
import { ADDRESSES } from "../config/addresses";
import { UniswapQuoterV2ABI } from "../abi/UniswapQuoterV2";
const quoter = new Contract(ADDRESSES.UNISWAP_QUOTER, UniswapQuoterV2ABI, provider);
export async function quote(tokenIn, tokenOut, amountIn, fee = 3000) {
    const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
    });
    return result.amountOut;
}
