export interface ProfitInput {

    buyAmount: bigint;

    sellAmount: bigint;

    gasCost: bigint;

    flashLoanFee: bigint;

    swapFee: bigint;

}

export function calculateProfit(
    input: ProfitInput
): bigint {

    return (
        input.sellAmount
        - input.buyAmount
        - input.gasCost
        - input.flashLoanFee
        - input.swapFee
    );

}