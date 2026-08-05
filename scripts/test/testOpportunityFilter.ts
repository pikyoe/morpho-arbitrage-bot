import { OpportunityFilter }
from "../../bot/filter/OpportunityFilter.js";

const filter =
    new OpportunityFilter({

        minNetProfitUSD: 2,

        maxGasRatio: 0.35,

        minROI: 0.001,

        minLoanUSD: 100

    });

const tests = [

    {

        name: "Healthy",

        loanAmountUSD: 1000,

        grossProfitUSD: 8,

        netProfitUSD: 5,

        gasRatio: 0.20

    },

    {

        name: "Low Profit",

        loanAmountUSD: 1000,

        grossProfitUSD: 2,

        netProfitUSD: 0.8,

        gasRatio: 0.10

    },

    {

        name: "Gas Too High",

        loanAmountUSD: 1000,

        grossProfitUSD: 5,

        netProfitUSD: 4,

        gasRatio: 0.70

    },

    {

        name: "Loan Too Small",

        loanAmountUSD: 20,

        grossProfitUSD: 10,

        netProfitUSD: 8,

        gasRatio: 0.05

    },

    {

        name: "Low ROI",

        loanAmountUSD: 50000,

        grossProfitUSD: 6,

        netProfitUSD: 3,

        gasRatio: 0.10

    }

];

console.log();

console.log("========== FILTER ==========");

console.log();

for (const t of tests) {

    const result =
        filter.filter(t);

    console.table({

        Case: t.name,

        Accepted: result.accepted,

        Reason: result.reason

    });

}