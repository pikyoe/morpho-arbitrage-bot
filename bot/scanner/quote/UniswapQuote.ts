import { Contract, Provider } from "ethers";

import { PoolCache } from "../PoolCache.js";

import {
    QuoteRequest,
    QuoteResult,
    IQuoteProvider
} from "./index.js";
import { rpcRateLimiter } from "../../utils/RateLimiter.js";

import { UNISWAP_QUOTER_ABI } from "../abis/UniswapQuoter.js";

export class UniswapQuote
    implements IQuoteProvider
{
    private provider: Provider;

    private cache: PoolCache;

    private quoter: Contract;

    constructor(

        provider: Provider,

        cache: PoolCache,

        quoterAddress: string

    ) {

        this.provider = provider;

        this.cache = cache;

        this.quoter =
            new Contract(

                quoterAddress,

                UNISWAP_QUOTER_ABI,

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

                        p.dex === "UNISWAP"

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

                await rpcRateLimiter.wait();

                const quote =
                    await this.quoter.quoteExactInputSingle.staticCall(

                        {

                            tokenIn:

                                request.tokenIn,

                            tokenOut:

                                request.tokenOut,

                            fee:

                                pool.fee,

                            amountIn:

                                request.amountIn,

                            sqrtPriceLimitX96: 0

                        }

                    );

                const amountOut =

                    Array.isArray(quote)

                        ? quote[0]

                        : quote;

                results.push({

                    dex: "UNISWAP",

                    pool: pool.pool,

                    tokenIn: request.tokenIn,

                    tokenOut: request.tokenOut,

                    amountIn: request.amountIn,

                    amountOut,

                    fee: pool.fee

                });

            }
            catch {

                continue;

            }

        }

        return results;

    }

}
