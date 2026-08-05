import { ethers } from "ethers";

import { Opportunity } from "./types/Opportunity.js";
import { ArbitrageCandidate } from "./scanner/MarketPairScanner.js";
import { AdapterRegistry } from "./registry/AdapterRegistry.js";

export class OpportunityMapper {

    constructor(
        private readonly registry: AdapterRegistry
    ) {}

    public map(
        candidate: ArbitrageCandidate,
        loanAmountUSD: number = 0
    ): Opportunity {

        const forward = candidate.forward;
        const reverse = candidate.reverse;

        let buyData = "0x";
        let sellData = "0x";

        if (forward.dex === "AERODROME") {
            buyData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["bool", "address"],
                [
                    forward.stable ?? false,
                    forward.factory!
                ]
            );
        }

        if (reverse.dex === "AERODROME") {
            sellData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["bool", "address"],
                [
                    reverse.stable ?? false,
                    reverse.factory!
                ]
            );
        }

        return {

            buyDex: forward.dex,
            sellDex: reverse.dex,

            buyAdapter: this.registry.get(forward.dex),
            sellAdapter: this.registry.get(reverse.dex),

            buyPool: forward.pool,
            sellPool: reverse.pool,

            tokenIn: forward.tokenIn,
            tokenOut: forward.tokenOut,

            buyFee: forward.fee,
            sellFee: reverse.fee,

            buyStable: forward.stable,
            sellStable: reverse.stable,

            loanAmount: candidate.amountIn,
            amountOut: forward.amountOut,
            amountBack: candidate.amountBack,

            loanAmountUSD,

            grossProfitUSD: 0,

            buyData,
            sellData,

            minProfit: 0n,

            timestamp: Date.now()

        };

    }

}