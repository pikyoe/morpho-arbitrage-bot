import { QuoteRequest, QuoteResult } from "../quote/index.js";
import { ZeroXAggregator } from "./ZeroXAggregator.js";
import { OneInchAggregator } from "./OneInchAggregator.js";

interface AggregatorQuote {
    aggregator: string;
    quote: QuoteResult | null;
    latency: number;
    error?: string;
}

export class HybridAggregator {
    private zeroX: ZeroXAggregator;
    private oneInch: OneInchAggregator | null;
    private useZeroXPrimary: boolean = true;

    constructor(zeroX: ZeroXAggregator, oneInch: OneInchAggregator | null) {
        this.zeroX = zeroX;
        this.oneInch = oneInch;
    }

    /**
     * Get best quote by trying both aggregators in parallel
     * Returns the quote with the best output amount
     */
    public async getBestQuote(request: QuoteRequest): Promise<QuoteResult | null> {
        const results: AggregatorQuote[] = [];

        // Try 0x first (primary)
        if (this.zeroX.isEnabled()) {
            const zeroXStart = Date.now();
            try {
                const zeroXQuote = await this.zeroX.getQuote(request);
                results.push({
                    aggregator: "0x",
                    quote: zeroXQuote,
                    latency: Date.now() - zeroXStart
                });
            } catch (error) {
                results.push({
                    aggregator: "0x",
                    quote: null,
                    latency: Date.now() - zeroXStart,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Try 1inch as fallback (in parallel)
        const oneInch = this.oneInch;
        if (oneInch && oneInch.isEnabled()) {
            const oneInchStart = Date.now();
            try {
                const oneInchQuote = await oneInch.getQuote(request);
                results.push({
                    aggregator: "1inch",
                    quote: oneInchQuote,
                    latency: Date.now() - oneInchStart
                });
            } catch (error) {
                results.push({
                    aggregator: "1inch",
                    quote: null,
                    latency: Date.now() - oneInchStart,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Filter valid quotes
        const validQuotes = results.filter(r => r.quote !== null) as AggregatorQuote[];
        
        if (validQuotes.length === 0) {
            return null;
        }

        // Return the quote with the best output amount
        const bestQuote = validQuotes.sort((a, b) => {
            const aAmount = a.quote!.amountOut;
            const bAmount = b.quote!.amountOut;
            return bAmount > aAmount ? 1 : -1;
        })[0];

        return bestQuote.quote;
    }

    /**
     * Get quote from primary aggregator only (0x)
     */
    public async getPrimaryQuote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (this.zeroX.isEnabled()) {
            return await this.zeroX.getQuote(request);
        }
        return null;
    }

    /**
     * Get quote from fallback aggregator only (1inch)
     */
    public async getFallbackQuote(request: QuoteRequest): Promise<QuoteResult | null> {
        const oneInch = this.oneInch;
        if (oneInch && oneInch.isEnabled()) {
            return await oneInch.getQuote(request);
        }
        return null;
    }

    /**
     * Get swap data from the aggregator that provided the best quote
     */
    public async getSwapData(
        request: QuoteRequest,
        fromAddress: string,
        slippage: number = 1,
        preferredAggregator?: string
    ): Promise<any | null> {
        if (this.oneInch && (preferredAggregator === "1inch" || preferredAggregator === "1INCH")) {
            return await this.oneInch.getSwapData(request, fromAddress, slippage);
        }
        
        // Default to 0x
        return await this.zeroX.getSwapData(request, fromAddress, slippage);
    }

    /**
     * Check health of both aggregators
     */
    public async checkHealth(): Promise<{ zeroX: boolean; oneInch: boolean }> {
        const [zeroXHealth, oneInchHealth] = await Promise.all([
            this.zeroX.checkHealth(),
            this.oneInch ? this.oneInch.checkHealth() : Promise.resolve(false)
        ]);

        return {
            zeroX: zeroXHealth,
            oneInch: oneInchHealth
        };
    }

    /**
     * Log aggregator comparison results
     */
    private logResults(results: AggregatorQuote[]): void {
        // Disabled for cleaner logs
    }

    /**
     * Enable/disable primary aggregator
     */
    public setUseZeroXPrimary(enabled: boolean): void {
        this.useZeroXPrimary = enabled;
    }

    /**
     * Get statistics from both aggregators
     */
    public getStats(): { zeroXEnabled: boolean; oneInchEnabled: boolean } {
        return {
            zeroXEnabled: this.zeroX.isEnabled(),
            oneInchEnabled: this.oneInch?.isEnabled() ?? false
        };
    }
}
