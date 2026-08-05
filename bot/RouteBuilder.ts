import { ethers } from "ethers";

import { AdapterRegistry } from "./registry/AdapterRegistry.js";
import { ArbitrageCandidate } from "./scanner/MarketPairScanner.js";

export interface SwapStep {

    adapter: string;

    tokenIn: string;

    tokenOut: string;

    fee: number;

    amountIn: bigint;

    minAmountOut: bigint;

    data: string;

    deadline: bigint;

}

export interface Route {

    swaps: SwapStep[];

    profitToken: string;

    minProfit: bigint;

}

export class RouteBuilder {

    static build(

        candidate: ArbitrageCandidate,

        registry: AdapterRegistry,

        slippageBps = 50

    ): Route {

        const deadline =
            BigInt(
                Math.floor(Date.now() / 1000) + 300
            );

        //
        // Slippage
        //

        const buyMinOut =
            candidate.forward.amountOut *
            BigInt(10000 - slippageBps) /
            10000n;

        const sellMinOut =
            candidate.amountIn +
            (
                candidate.profit > 0n
                    ? candidate.profit *
                      BigInt(10000 - slippageBps) /
                      10000n
                    : 0n
            );

        return {

            swaps: [

                {

                    adapter:
                        registry.get(
                            candidate.forward.dex
                        ),

                    tokenIn:
                        candidate.forward.tokenIn,

                    tokenOut:
                        candidate.forward.tokenOut,

                    fee:
                        candidate.forward.fee ?? 0,

                    amountIn:
                        candidate.amountIn,

                    minAmountOut:
                        buyMinOut,

                    data:
                        this.encodeData(
                            candidate.forward
                        ),

                    deadline

                },

                {

                    adapter:
                        registry.get(
                            candidate.reverse.dex
                        ),

                    tokenIn:
                        candidate.reverse.tokenIn,

                    tokenOut:
                        candidate.reverse.tokenOut,

                    fee:
                        candidate.reverse.fee ?? 0,

                    //
                    // Engine akan otomatis
                    // mengganti 0 menjadi output
                    // swap sebelumnya.
                    //

                    amountIn:
                        0n,

                    minAmountOut:
                        sellMinOut,

                    data:
                        this.encodeData(
                            candidate.reverse
                        ),

                    deadline

                }

            ],

            profitToken:
                candidate.forward.tokenIn,

            minProfit:
                candidate.profit > 0n
             ? candidate.profit * 90n / 100n
              : 0n

        };

    }

    private static encodeData(
        quote: {
            dex: string;
            stable?: boolean;
            factory?: string;
        }
    ): string {

        if (quote.dex === "UNISWAP") {

            return "0x";

        }

        if (quote.dex === "AERODROME") {

            return ethers.AbiCoder.defaultAbiCoder().encode(

                [

                    "bool",

                    "address"

                ],

                [

                    quote.stable ?? false,

                    quote.factory ??

                    ethers.ZeroAddress

                ]

            );

        }

        return "0x";

    }

}