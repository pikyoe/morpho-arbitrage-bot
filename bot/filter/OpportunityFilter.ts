export interface Opportunity {

    loanAmountUSD: number;

    grossProfitUSD: number;

    netProfitUSD: number;

    gasRatio: number;

}

export interface FilterConfig {

    minNetProfitUSD: number;

    minGrossProfitUSD?: number;

    maxGasRatio: number;

    minROI: number;

    minLoanUSD: number;

}

export interface FilterResult {

    accepted: boolean;

    reason: string;

}

export class OpportunityFilter {

    constructor(
        private readonly config: FilterConfig
    ) {}

    public filter(
        opportunity: Opportunity
    ): FilterResult {

        if (![opportunity.loanAmountUSD, opportunity.grossProfitUSD,
            opportunity.netProfitUSD, opportunity.gasRatio].every(Number.isFinite)) {
            return { accepted: false, reason: "InvalidMetrics" };
        }

        if (
            opportunity.loanAmountUSD <
            this.config.minLoanUSD
        ) {

            return {

                accepted: false,

                reason: "LoanTooSmall"

            };

        }

        if (
            this.config.minGrossProfitUSD !== undefined &&
            opportunity.grossProfitUSD < this.config.minGrossProfitUSD
        ) {
            return { accepted: false, reason: "GrossProfit" };
        }

        if (
            opportunity.netProfitUSD <
            this.config.minNetProfitUSD
        ) {

            return {

                accepted: false,

                reason: "NetProfit"

            };

        }

        if (
            opportunity.gasRatio >
            this.config.maxGasRatio
        ) {

            return {

                accepted: false,

                reason: "GasRatio"

            };

        }

        const roi =
            opportunity.netProfitUSD /
            opportunity.loanAmountUSD;

        if (
            roi <
            this.config.minROI
        ) {

            return {

                accepted: false,

                reason: "ROI"

            };

        }

        return {

            accepted: true,

            reason: "Accepted"

        };

    }

}
