export function flashLoanFee(amount, bps = 5n) {
    return (amount *
        bps) / 10000n;
}
