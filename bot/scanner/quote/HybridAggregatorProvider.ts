import { QuoteRequest, QuoteResult, IQuoteProvider } from "./index.js";
import { HybridAggregator } from "../aggregator/HybridAggregator.js";

export class HybridAggregatorProvider implements IQuoteProvider {
    private aggregator: HybridAggregator;

    constructor(aggregator: HybridAggregator) {
        this.aggregator = aggregator;
    }

    async quote(request: QuoteRequest): Promise<QuoteResult[]> {
        const result = await this.aggregator.getBestQuote(request);
        
        if (result) {
            return [result];
        }
        
        return [];
    }
}
