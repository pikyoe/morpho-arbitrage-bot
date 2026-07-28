import { scanDex } from "./scanDex.js";
import { compareQuotes } from "./compareQuotes.js";
import { display } from "./display.js";
import { calculateProfit } from "./profit.js";
export async function runScanner() {
    try {
        const quotes = await scanDex();
        const result = compareQuotes(quotes);
        display(result);
        const profit = calculateProfit(result);
        console.log();
        console.log("==============================");
        console.log("Profit Analysis");
        console.log("==============================");
        console.log("Spread :", profit.spread.toFixed(6), "USDC");
        console.log("Gas    :", profit.gas.toFixed(6), "USDC");
        console.log("Net    :", profit.net.toFixed(6), "USDC");
        console.log();
        if (profit.execute) {
            console.log();
            console.log("Executing...");
            const { execute } = await import("../executor/execute.js");
            await execute(1000000000000000000n);
        }
    }
    catch (err) {
        console.error(err);
    }
}
