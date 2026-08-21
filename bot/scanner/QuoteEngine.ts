import {
    QuoteRequest,
    QuoteResult,
    IQuoteProvider
} from "./quote/index.js";
import { DexQuoteProvider } from "./quote/DexQuoteProvider.js";

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

        // Providers are self-rate-limited (DEX quoters via quoteRateLimiter,
        // aggregators via their own API limiters), so an extra engine-level
        // wait() only stalled every scan without lowering total request volume.
        // Query them concurrently — a per-provider failure no longer blocks
        // the rest of the batch.
        const responses = await Promise.all(
            this.providers.map(async (provider) => {
                try {
                    return await provider.quote(request);
                } catch (error) {
                    console.warn(
                        "Quote provider failed for",
                        request.tokenIn,
                        "->",
                        request.tokenOut,
                        "error:",
                        error
                    );
                    return [] as QuoteResult[];
                }
            })
        );

        const quotes: QuoteResult[] = responses.flat();

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
