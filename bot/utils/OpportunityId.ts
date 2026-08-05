import { keccak256, toUtf8Bytes } from "ethers";

import { ArbitrageCandidate } from "../scanner/MarketPairScanner.js";

export class OpportunityId {

    static create(
        candidate: ArbitrageCandidate
    ): string {

        const raw = [

            candidate.forward.dex,

            candidate.reverse.dex,

            candidate.forward.pool,

            candidate.reverse.pool,

            candidate.amountIn.toString(),

            candidate.forward.tokenIn,

            candidate.forward.tokenOut,

            Date.now()

        ].join("|");

        return keccak256(
            toUtf8Bytes(raw)
        );

    }

}