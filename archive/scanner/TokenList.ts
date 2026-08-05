export const TOKENS = {

    WETH: process.env.WETH_ADDRESS!,

    USDC: process.env.USDC_ADDRESS!,

    CBBTC: process.env.CBBTC_ADDRESS!,

    CBETH: process.env.CBETH_ADDRESS!,

    AERO: process.env.AERO_ADDRESS!

};

export const TOKEN_ARRAY = Object.values(TOKENS).filter(
    (address): address is string => typeof address === "string" && address.length > 0
);
