const GAS_COST_USDC = 0.20;
const MIN_PROFIT_USDC = 0.30;
export function calculateProfit(result) {
    const buy = Number(result.bestBuy.amountOut) / 1e6;
    const sell = Number(result.bestSell.amountOut) / 1e6;
    const spread = sell - buy;
    const gas = GAS_COST_USDC;
    const net = spread - gas;
    return {
        spread,
        gas,
        net,
        execute: net >= MIN_PROFIT_USDC
    };
}
