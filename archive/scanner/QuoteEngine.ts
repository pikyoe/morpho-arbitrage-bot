import {

    QuoteRequest,
    QuoteResult,
    IQuoteProvider

} from "./quote/index.js";

export class QuoteEngine {

    private providers: IQuoteProvider[];

    constructor(

        providers: IQuoteProvider[] = []

    ) {

        this.providers = providers;

    }

    registerProvider(

        provider: IQuoteProvider

    ) {

        this.providers.push(provider);

    }

    public async getAllQuotes(

        request: QuoteRequest

    ): Promise<QuoteResult[]> {

        const responses =

            await Promise.all(

                this.providers.map(

                    p => p.quote(request)

                )

            );

        const quotes =

            responses.flat();

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
