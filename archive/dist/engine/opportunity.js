import { COST } from "../utils/costs.js";
import { calculateProfit } from "./profit.js";
export function buildOpportunity(pair, buyDex, sellDex, amountIn, buyAmount, sellAmount) {
    const spread = sellAmount - buyAmount;
    const gas = COST.GAS_ESTIMATE_USDC;
    const flash = COST.FLASH_FEE_USDC;
    const swap = COST.SWAP_FEE_USDC;
    const profit = calculateProfit({
        buyAmount,
        sellAmount,
        gasCost: gas,
        flashLoanFee: flash,
        swapFee: swap
    });
    return {
        pair,
        buyDex,
        sellDex,
        amountIn,
        buyAmount,
        sellAmount,
        spread,
        gasCost: gas,
        flashLoanFee: flash,
        swapFee: swap,
        netProfit: profit,
        profitable: profit > 0n
    };
}
