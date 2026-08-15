import { QuoteRequest, QuoteResult } from "./index.js";

/**
 * Interface for DEX-specific quote providers used for arbitrage discovery
 * Unlike aggregators (0x, 1inch), these providers return quotes from specific DEXes
 * to enable cross-DEX arbitrage discovery
 */
export interface DexQuoteProvider {
    /**
     * Get a quote from this specific DEX
     * @param request Quote request with token addresses and amount
     * @returns Quote result with DEX-specific routing, or null if quote not available
     */
    quote(request: QuoteRequest): Promise<QuoteResult | null>;
    
    /**
     * Get the name of this DEX
     * @returns DEX name (e.g., "Aerodrome", "UniswapV3")
     */
    getDexName(): string;
    
    /**
     * Check if this provider is enabled
     * @returns true if provider is available and should be used
     */
    isEnabled(): boolean;
}
