export const TOKENS = {

    WETH: process.env.WETH_ADDRESS || "0x4200000000000000000000000000000000000006",

    USDC: process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

    CBBTC: process.env.CBBTC_ADDRESS || "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",

    CBETH: process.env.CBETH_ADDRESS || "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",

    AERO: process.env.AERO_ADDRESS || "0x940181a94A35A4569E4529A3CDfB74e38FD98631",

    // Major tokens for triangular arbitrage (verified Base addresses)
    DAI: process.env.DAI_ADDRESS || "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",

    USDT: process.env.USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",

    // High liquidity tokens on Base
    VIRTUAL: process.env.VIRTUAL_ADDRESS || "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",

    EURC: process.env.EURC_ADDRESS || "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",

    // Bridge tokens for arbitrage opportunities
    USDe: process.env.USDE_ADDRESS || "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
    
    RLUSD: process.env.RLUSD_ADDRESS || "0x8d58C0C60B8D6b88Fa98B291a646dB34d0F98258",
    
    MORPHO_TOKEN: process.env.MORPHO_TOKEN_ADDRESS || "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842",

    // Additional tokens for triangular arbitrage
    wstETH: process.env.WSTETH_ADDRESS || "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
    sUSDS: process.env.SUSDS_ADDRESS || "0x5875eee11cf8398102fdad704c9e96607675467a",
    ZRO: process.env.ZRO_ADDRESS || "0x6985884c4392d348587b19cb9eaaf157f13271cd",
    ZORA: process.env.ZORA_ADDRESS || "0x1111111111166b7fe7bd91427724b487980afc69",
    LINK: process.env.LINK_ADDRESS || "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196",
    CRV: process.env.CRV_ADDRESS || "0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415",
    PENDLE: process.env.PENDLE_ADDRESS || "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e",
    KAITO: process.env.KAITO_ADDRESS || "0x98d0baa52b2d063e780de12f615f963fe8537553",
    DEGEN: process.env.DEGEN_ADDRESS || "0x4ed4e862860bed51a9570b96d89af5e1b0efefed"

};

// Token decimals configuration for Base chain
export const TOKEN_DECIMALS: Record<string, number> = {
    "0x4200000000000000000000000000000000000006": 18, // WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,  // USDC
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 8,  // CBBTC
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 18, // CBETH
    "0x940181a94a35a4569e4529a3cdfb74e38fd98631": 18, // AERO
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18, // DAI
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": 6,  // USDT
    "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": 18, // VIRTUAL
    "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 6,  // EURC (Circle Euro stablecoin)
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": 18, // USDe
    "0x8d58c0c60b8d6b88fa98b291a646db34d0f98258": 6,  // RLUSD
    "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842": 18, // MORPHO_TOKEN
    "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": 18, // wstETH
    "0x5875eee11cf8398102fdad704c9e96607675467a": 18, // sUSDS
    "0x6985884c4392d348587b19cb9eaaf157f13271cd": 18, // ZRO
    "0x1111111111166b7fe7bd91427724b487980afc69": 18, // ZORA
    "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": 18, // LINK
    "0x8ee73c484a26e0a5df2ee2a4960b789967dd0415": 18, // CRV
    "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e": 18, // PENDLE
    "0x98d0baa52b2d063e780de12f615f963fe8537553": 18, // KAITO
    "0x4ed4e862860bed51a9570b96d89af5e1b0efefed": 18  // DEGEN
};

// Helper function to parse token amounts with correct decimals
export function parseUnits(amount: string, decimals: number): bigint {
    const [whole, fraction = ""] = amount.split(".");
    
    const paddedFraction = fraction
        .padEnd(decimals, "0")
        .slice(0, decimals);
    
    return BigInt(whole) * (10n ** BigInt(decimals))
        + BigInt(paddedFraction || "0");
}

// Helper function to format token amounts
export function formatUnits(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    
    return whole.toString() + (fraction > 0n ? "." + fraction.toString().padStart(Number(decimals), "0") : "");
}

export const TOKEN_ARRAY = Object.values(TOKENS).filter(
    (address): address is string => typeof address === "string" && address.length > 0
);
