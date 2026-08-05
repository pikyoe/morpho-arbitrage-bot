export function swapFee(amount, feeBps) {
    return (amount *
        feeBps) / 10000n;
}
