import type {

    DexQuote,

    ScannerResult

} from "./types.js";

export function compareQuotes(

    quotes: DexQuote[]

): ScannerResult {

    const sorted =

        [...quotes].sort(

            (a, b) =>

                a.amountOut > b.amountOut

                    ? 1

                    : -1

        );

    return {

        quotes,

        bestBuy:

            sorted[0],

        bestSell:

            sorted[sorted.length - 1]

    };

}