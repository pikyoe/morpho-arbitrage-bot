import { formatUnits } from "ethers";

import type {

    ScannerResult

} from "./types.js";

export function display(

    result: ScannerResult

) {

    console.log(

        "=============================="

    );

    console.log(

        "BASE MAINNET ARBITRAGE SCANNER"

    );

    console.log(

        "=============================="

    );

    console.log();

    console.log(

        "Scanning..."

    );

    console.log();

    for (const quote of result.quotes) {

        console.log(

            `${quote.dex.padEnd(10)}: ${formatUnits(

                quote.amountOut,

                6

            )} USDC`

        );

    }

    console.log();

    console.log(

        "Best Buy :",

        result.bestBuy.dex

    );

    console.log(

        "Best Sell:",

        result.bestSell.dex

    );

}