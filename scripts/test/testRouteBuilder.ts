import { RouteBuilder } from "../../bot/RouteBuilder.js";
import { Opportunity } from "../../bot/types/Opportunity.js";

const opportunity: Opportunity = {

    buyDex: "UNISWAP",
    sellDex: "AERODROME",

    buyAdapter: "0x1111111111111111111111111111111111111111",
    sellAdapter: "0x2222222222222222222222222222222222222222",

    buyPool: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sellPool: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",

    tokenIn: "0x4200000000000000000000000000000000000006",
    tokenOut: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

    buyFee: 100,
    sellStable: false,

    loanAmount: 10_000_000_000_000_000n,

    amountOut: 18_721_123n,

    amountBack: 10_010_000_000_000_000n,

    loanAmountUSD: 30,

    grossProfitUSD: 0.12,

    buyData: "0x",

    sellData: "0x1234",

    minProfit: 0n

};

const route =
    RouteBuilder.build(opportunity);

console.dir(route, {
    depth: null
});