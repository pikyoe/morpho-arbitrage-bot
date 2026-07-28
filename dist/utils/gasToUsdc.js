export function gasETHtoUSDC(gasWei, wethPriceUSDC) {
    return (gasWei *
        wethPriceUSDC) /
        1000000000000000000n;
}
