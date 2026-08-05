export function compareQuotes(quotes) {
    const sorted = [...quotes].sort((a, b) => a.amountOut > b.amountOut
        ? 1
        : -1);
    return {
        quotes,
        bestBuy: sorted[0],
        bestSell: sorted[sorted.length - 1]
    };
}
