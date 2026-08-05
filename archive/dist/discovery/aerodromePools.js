export function getAerodromePools(tokenIn, tokenOut) {
    return [
        {
            dex: "Aerodrome",
            pool: "volatile",
            tokenIn,
            tokenOut,
            stable: false
        },
        {
            dex: "Aerodrome",
            pool: "stable",
            tokenIn,
            tokenOut,
            stable: true
        }
    ];
}
