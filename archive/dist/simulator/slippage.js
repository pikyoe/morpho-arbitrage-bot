export function applySlippage(amount, bps) {
    return (amount *
        (10000n - bps)) / 10000n;
}
