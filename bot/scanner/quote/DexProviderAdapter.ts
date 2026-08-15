import { QuoteRequest, QuoteResult, IQuoteProvider } from "./index.js";
import { DexQuoteProvider } from "./DexQuoteProvider.js";

/**
 * Adapter to make DexQuoteProvider compatible with IQuoteProvider interface
 * Converts single QuoteResult | null to QuoteResult[]
 */
export class DexProviderAdapter implements IQuoteProvider {
    private dexProvider: DexQuoteProvider;

    constructor(dexProvider: DexQuoteProvider) {
        this.dexProvider = dexProvider;
    }

    async quote(request: QuoteRequest): Promise<QuoteResult[]> {
        const result = await this.dexProvider.quote(request);
        if (result) {
            return [result];
        }
        return [];
    }
}
