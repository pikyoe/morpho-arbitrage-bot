import { parseEther } from "ethers";
import { TOKENS } from "../config/tokens.js";
import { DEXES } from "../dex/registry.js";
export async function scanDex() {
    const amount = parseEther("1");
    const quotes = [];
    for (const dex of DEXES) {
        try {
            const amountOut = await dex.quote(TOKENS.WETH, TOKENS.USDC, amount);
            quotes.push({
                dex: dex.name,
                amountOut
            });
        }
        catch (error) {
            console.log(dex.name, "failed");
        }
    }
    return quotes;
}
