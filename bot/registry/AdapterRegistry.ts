/**
 * Registry mapping DEX names (as reported by DexQuoteProvider.getDexName)
 * to the deployed adapter contract addresses registered with the engine.
 */
export class AdapterRegistry {
    constructor(
        public readonly uniswap: string,
        public readonly sushiSwap: string,
        public readonly pancakeSwap: string,
        public readonly aerodrome: string,
    ) {}

    /**
     * Resolve a DEX name (as reported by the provider) to the adapter address.
     * Accepts both the provider names ("UniswapV3", "SushiSwap", "PancakeSwap", "Aerodrome")
     * and the legacy uppercase forms ("UNISWAP", "AERODROME").
     */
    get(dex: string): string {
        switch (dex) {
            case "UniswapV3":
            case "UNISWAP":
                return this.uniswap;

            case "SushiSwap":
            case "SUSHISWAP":
                return this.sushiSwap;

            case "PancakeSwap":
            case "PANCAKESWAP":
                return this.pancakeSwap;

            case "Aerodrome":
            case "AERODROME":
                return this.aerodrome;

            default:
                throw new Error(`Unknown DEX: ${dex}`);
        }
    }
}
