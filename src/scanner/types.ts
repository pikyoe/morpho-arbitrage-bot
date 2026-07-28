export interface DexQuote {

    dex: string;

    amountOut: bigint;

}

export interface ScannerResult {

    quotes: DexQuote[];

    bestBuy: DexQuote;

    bestSell: DexQuote;

}