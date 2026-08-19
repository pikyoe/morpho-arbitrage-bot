import { ArbitrageCandidate } from "../scanner/MarketPairScanner.js";
import { OpportunityFilter } from "../filter/OpportunityFilter.js";
import { FlashLoanExecutor } from "../executor/FlashLoanExecutor.js";
import { RouteBuilder } from "../RouteBuilder.js";
import { AdapterRegistry } from "../registry/AdapterRegistry.js";
import { OpportunityRepository } from "../repository/OpportunityRepository.js";

export class ExecutionHandler {

    constructor(

        private readonly filter: OpportunityFilter,

        private readonly registry: AdapterRegistry,

        private readonly executor: FlashLoanExecutor,

        private readonly repository: OpportunityRepository

    ) {}

    async onScanFinished(

        opportunities: ArbitrageCandidate[]

    ) {

        if (

            opportunities.length === 0

        ) {

            console.log(

                "No opportunity."

            );

            return;

        }

        const best =

            this.selectBest(

                opportunities

            );

        if (!best) {

            console.log(

                "All rejected."

            );

            return;

        }

        if (

            best.id &&

            this.repository.has(best.id)

        ) {

            console.log(

                "Already executed recently."

            );

            return;

        }

        console.log();

        console.log(

            "Executing:",

            best.id

        );

        const route =

            RouteBuilder.build(

                best,

                this.registry

            );

        try {

            await this.executor.execute(

                best.forward.tokenIn,

                best.amountIn,

                route

            );

        } catch (e: any) {

            // Never let a failed execution kill the scan loop.

            console.error(

                "Execution failed:",

                e?.message || String(e)

            );

            return;

        }

        if (best.id) {

            this.repository.save(best);

        }

    }

    private selectBest(

        opportunities: ArbitrageCandidate[]

    ): ArbitrageCandidate | null {

        let best: ArbitrageCandidate | null = null;

        for (const opportunity of opportunities) {

            const result =
                this.filter.filter({
                    loanAmountUSD: Number(
                        opportunity.amountIn
                    ),
                    grossProfitUSD: opportunity.grossProfitUSD ?? 0,
                    netProfitUSD: opportunity.netProfitUSD ?? 0,
                    gasRatio: opportunity.gasCostUSD
                        ? opportunity.gasCostUSD === 0
                            ? 0
                            : (opportunity.gasCostUSD ?? 0) / (opportunity.grossProfitUSD ?? 1)
                        : Infinity
                });

            if (!result.accepted) {
                continue;
            }

            if (!best || (opportunity.netProfitUSD ?? 0) > (best.netProfitUSD ?? 0)) {
                best = opportunity;
            }

        }

        return best;

    }

}