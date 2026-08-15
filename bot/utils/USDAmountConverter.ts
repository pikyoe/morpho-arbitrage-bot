import { parseUnits } from "ethers";
import { TOKEN_DECIMALS } from "../scanner/TokenList.js";

/**
 * USD Amount Converter
 * Converts USD values to token-equivalent amounts to avoid extreme price impact
 * 
 * Example:
 * - $100 USD → 0.0526 WETH (100/1900)
 * - $100 USD → 100 USDC (100/1)
 * - $100 USD → 66.67 VIRTUAL (100/1.5)
 */

// Token price estimates in USD (fallback prices for discovery)
// In production, these should come from PriceOracle
const TOKEN_PRICES_USD: Record<string, number> = {
    // Stablecoins = $1 USD
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 1.0,   // USDC
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": 1.0,   // USDT
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 1.0,   // DAI
    "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 1.0,   // EURC (approx $1)
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": 1.0,   // USDe (synthetic $1)
    "0x8d58c0c60b8d6b88fa98b291a646db34d0f98258": 1.0,   // RLUSD
    
    // Major tokens (estimated prices)
    "0x4200000000000000000000000000000000000006": 1900.0, // WETH (~$1,900)
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 95000.0, // CBBTC (~$95,000)
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 2800.0, // CBETH (~$2,800)
    "0x940181a94a35a4569e4529a3cdfb74e38fd98631": 2.5,    // AERO (~$2.5)
    "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": 1.5,    // VIRTUAL (~$1.5)
    "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842": 1.2,    // MORPHO_TOKEN (~$1.2)
    "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": 3200.0, // wstETH (~$3,200)
    "0x5875eee11cf8398102fdad704c9e96607675467a": 1.05,   // sUSDS (~$1.05)
    "0x6985884c4392d348587b19cb9eaaf157f13271cd": 4.0,    // ZRO (~$4)
    "0x1111111111166b7fe7bd91427724b487980afc69": 0.15,   // ZORA (~$0.15)
    "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": 18.0,   // LINK (~$18)
    "0x8ee73c484a26e0a5df2ee2a4960b789967dd0415": 0.35,   // CRV (~$0.35)
    "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e": 3.5,    // PENDLE (~$3.5)
    "0x98d0baa52b2d063e780de12f615f963fe8537553": 0.5,    // KAITO (~$0.5)
    "0x4ed4e862860bed51a9570b96d89af5e1b0efefed": 0.08,   // DEGEN (~$0.08)
};

/**
 * Convert USD amount to token-equivalent amount
 * 
 * @param usdAmount USD value (e.g., 100 for $100)
 * @param tokenAddress Token address
 * @returns Token amount in token decimals (as bigint)
 */
export function convertUSDToTokenAmount(usdAmount: number, tokenAddress: string): bigint {
    const tokenPriceUSD = TOKEN_PRICES_USD[tokenAddress.toLowerCase()];
    if (!Number.isFinite(tokenPriceUSD) || tokenPriceUSD <= 0) {
        throw new Error(`No validated USD price for token ${tokenAddress}`);
    }
    const tokenDecimals = TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;
    
    // Calculate token amount: USD value / token price
    const tokenAmount = usdAmount / tokenPriceUSD;
    
    // Convert to token decimals
    return parseUnits(tokenAmount.toFixed(6), tokenDecimals);
}

/**
 * Convert USD amount to USDC amount (6 decimals)
 * 
 * @param usdAmount USD value (e.g., 100 for $100)
 * @returns USDC amount in 6 decimals (as bigint)
 */
export function convertUSDToUSDC(usdAmount: number): bigint {
    return parseUnits(usdAmount.toString(), 6);
}

/**
 * Get token price in USD
 * 
 * @param tokenAddress Token address
 * @returns Token price in USD
 */
export function getTokenPriceUSD(tokenAddress: string): number {
    return TOKEN_PRICES_USD[tokenAddress.toLowerCase()] ?? 0;
}

/**
 * Update token price (for dynamic price updates from PriceOracle)
 * 
 * @param tokenAddress Token address
 * @param priceUSD Price in USD
 */
export function updateTokenPrice(tokenAddress: string, priceUSD: number): void {
    TOKEN_PRICES_USD[tokenAddress.toLowerCase()] = priceUSD;
}
