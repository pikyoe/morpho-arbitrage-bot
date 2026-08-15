import {
    QuoteRequest,
    QuoteResult,
    IQuoteProvider
} from "./quote/index.js";
import { DexQuoteProvider } from "./quote/DexQuoteProvider.js";
import { quoteRateLimiter } from "../utils/RateLimiter.js";

export class QuoteEngine {

    private providers: IQuoteProvider[];

    constructor(
        providers: IQuoteProvider[] = []
    ) {
        this.providers = providers;
        
        // Debug: Log all registered providers
        console.log(`[QuoteEngine] Initialized with ${providers.length} providers:`);
        for (const provider of providers) {
            console.log(`  - ${provider.constructor.name}`);
        }
    }

    registerProvider(

        provider: IQuoteProvider

    ) {

        this.providers.push(provider);

    }

    public async getAllQuotes(

        request: QuoteRequest

    ): Promise<QuoteResult[]> {

        const quotes: QuoteResult[] = [];

        for (const provider of this.providers) {

            await quoteRateLimiter.wait();

            try {
                const response = await provider.quote(request);
                quotes.push(...response);
            } catch (error) {
                console.warn(
                    "Quote provider failed for",
                    request.tokenIn,
                    "->",
                    request.tokenOut,
                    "error:",
                    error
                );
            }

        }

        quotes.sort(

            (a, b) =>

                Number(

                    b.amountOut -

                    a.amountOut

                )

        );

        return quotes;

    }

    public async getBestQuote(

        request: QuoteRequest

    ): Promise<QuoteResult | null> {

        const quotes =

            await this.getAllQuotes(

                request

            );

        if (quotes.length == 0) {
            return null;
        }

        return quotes[0];

    }

    public async getWorstQuote(

        request: QuoteRequest

    ): Promise<QuoteResult | null> {

        const quotes =

            await this.getAllQuotes(

                request

            );

        if (quotes.length == 0) {
            return null;
        }

        return quotes[
            quotes.length - 1
        ];

    }
}
