import { QuoteRequest, QuoteResult } from "./QuoteTypes.js";

export interface IQuoteProvider {

    quote(

        request: QuoteRequest

    ): Promise<QuoteResult[]>;

}