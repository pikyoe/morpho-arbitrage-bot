import { Contract, Provider } from "ethers";

import { PoolCache } from "../PoolCache.js";

import {
    QuoteRequest,
    QuoteResult,
    IQuoteProvider
} from "./index.js";

import { AERODROME_ROUTER_ABI } from "../abis/AerodromeRouter.js";

export class AerodromeQuote
    implements IQuoteProvider
{
    private provider: Provider;

    private cache: PoolCache;

    private router: Contract;

    constructor(

        provider: Provider,

        cache: PoolCache,

        routerAddress: string

    ) {

        this.provider = provider;

        this.cache = cache;

        this.router =
            new Contract(

                routerAddress,

                AERODROME_ROUTER_ABI,

                provider

            );

    }

    public async quote(

    request: QuoteRequest

): Promise<QuoteResult[]> {

    const results: QuoteResult[] = [];

    const pools =
        this.cache
            .getAll()
            .filter(

                p =>

                    p.dex === "AERODROME"

                    &&

                    (

                        (

                            p.token0.toLowerCase()

                            ===

                            request.tokenIn.toLowerCase()

                            &&

                            p.token1.toLowerCase()

                            ===

                            request.tokenOut.toLowerCase()

                        )

                        ||

                        (

                            p.token1.toLowerCase()

                            ===

                            request.tokenIn.toLowerCase()

                            &&

                            p.token0.toLowerCase()

                            ===

                            request.tokenOut.toLowerCase()

                        )

                    )

            );
     
    for (const pool of pools) {

    try {

        const routes = [

            {

                from: request.tokenIn,

                to: request.tokenOut,

                stable: pool.stable,

                factory: pool.factory

            }

        ];

        const amounts =
            await this.router.getAmountsOut.staticCall(

                request.amountIn,

                routes

            );
            
                const amountOut =
            amounts[
                amounts.length - 1
            ];

        results.push({

            dex: "AERODROME",

            pool: pool.pool,

            tokenIn: request.tokenIn,

            tokenOut: request.tokenOut,

            amountIn: request.amountIn,

            amountOut,

            stable: pool.stable,

            factory: pool.factory

        });

    }
    catch {

        continue;

    }

}

return results;

}

}
