export function calculateProfit(input) {
    return (input.sellAmount
        - input.buyAmount
        - input.gasCost
        - input.flashLoanFee
        - input.swapFee);
}
