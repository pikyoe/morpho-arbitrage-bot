import { formatEther, formatUnits } from "ethers";

import { ArbitrageCandidate } from "../scanner/MarketPairScanner.js";

export class OpportunityLogger {

    static print(
        candidate: ArbitrageCandidate,
        ethPriceUSD: number,
        gasPrice: bigint
    ): void {

        console.log();

        console.log("============================================================");
        console.log("OPPORTUNITY");
        console.log("============================================================");

        console.log(
            "ID               :",
            candidate.id
        );

        console.log(
            "Time             :",
            new Date().toISOString()
        );

        console.log("");

        console.log("BUY");

        console.log(
            "DEX              :",
            candidate.forward.dex
        );

        console.log(
            "Pool             :",
            candidate.forward.pool
        );

        if (candidate.forward.fee != null) {

            console.log(
                "Fee              :",
                candidate.forward.fee
            );

        }

        if (candidate.forward.stable != null) {

            console.log(
                "Stable           :",
                candidate.forward.stable
            );

        }

        console.log("");

        console.log("SELL");

        console.log(
            "DEX              :",
            candidate.reverse.dex
        );

        console.log(
            "Pool             :",
            candidate.reverse.pool
        );

        if (candidate.reverse.fee != null) {

            console.log(
                "Fee              :",
                candidate.reverse.fee
            );

        }

        if (candidate.reverse.stable != null) {

            console.log(
                "Stable           :",
                candidate.reverse.stable
            );

        }

        console.log("");

        console.log(
            "Loan Amount      :",
            formatEther(candidate.amountIn),
            "WETH"
        );

        console.log(
            "Amount Back      :",
            formatEther(candidate.amountBack),
            "WETH"
        );

        console.log(
            "Gross Profit     :",
            formatEther(candidate.profit),
            "WETH"
        );

        console.log("");

        console.log(
            "ETH Price        :",
            `$${ethPriceUSD.toFixed(2)}`
        );

        console.log(
            "Gas Price        :",
            formatUnits(gasPrice, "gwei"),
            "gwei"
        );

        console.log(
            "Gas Cost         :",
            `$${candidate.gasCostUSD?.toFixed(4) ?? "0.0000"}`
        );

        console.log(
            "Flash Loan Fee   :",
            `$${candidate.flashLoanFeeUSD?.toFixed(4) ?? "0.0000"}`
        );

        console.log(
            "Net Profit       :",
            `$${candidate.netProfitUSD?.toFixed(4) ?? "0.0000"}`
        );

        console.log("");

        console.log(
            "Status           :",
            candidate.profitable
                ? "✅ PROFITABLE"
                : "❌ REJECTED"
        );

        console.log("============================================================");
        console.log();

    }

}