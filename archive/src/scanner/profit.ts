import type { ScannerResult } from "./types.js";

const GAS_COST_USDC = 0.20;

const MIN_PROFIT_USDC = 0.30;

export interface ProfitResult {

    spread: number;

    gas: number;

    net: number;

    execute: boolean;

}

export function calculateProfit(

    result: ScannerResult

): ProfitResult {

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