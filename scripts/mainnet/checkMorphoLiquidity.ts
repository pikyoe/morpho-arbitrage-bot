/**
 * checkMorphoLiquidity.ts
 *
 * Checks Morpho flash loan pool liquidity to determine if enough tokens
 * are available for a flash loan. Run with:
 *   ENV_FILE=.env.mainnet npx tsx scripts/mainnet/checkMorphoLiquidity.ts
 */

import * as dotenv from "dotenv";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";

if (!process.env.ENV_FILE) {
    dotenv.config({ path: ".env.mainnet" });
}
if (process.env.ENV_FILE) {
    dotenv.config({ path: process.env.ENV_FILE });
}

const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL;
const MORPHO_ADDRESS = process.env.MORPHO_ADDRESS;
const MORPHO_FLASHLOAN_ADDRESS = process.env.MORPHO_FLASHLOAN_V2_ADDRESS
    || process.env.MORPHO_FLASHLOAN_ADDRESS
    || "0x9372a039638Ff82eD316Bc8Ee5f0A888AcE039C8";

if (!RPC_URL) throw new Error("BASE_RPC_URL not set");

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
];

const MORPHO_ABI = [
    "function flashLoan(address token, uint256 assets, bytes data) external",
    "function owner() view returns (address)",
    "function engine() view returns (address)",
];

const TOKENS: { name: string; address: string; decimals: number }[] = [
    { name: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { name: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
    { name: "AERO", address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631", decimals: 18 },
    { name: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", decimals: 6 },
    { name: "VIRTUAL", address: "0x0b3e328455c4059eeb9e3f84b66d6756878677c9", decimals: 18 },
    { name: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd5782588411511c8c", decimals: 8 },
];

async function main() {
    const provider = new JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();

    console.log("====================================");
    console.log("  MORPHO LIQUIDITY CHECK");
    console.log("====================================");
    console.log("Network   :", network.name, `(chainId ${network.chainId})`);
    console.log("Morpho    :", MORPHO_ADDRESS || "(not set in env)");
    console.log("FlashLoan :", MORPHO_FLASHLOAN_ADDRESS);
    console.log();

    // Check flash loan contract
    if (MORPHO_FLASHLOAN_ADDRESS && MORPHO_FLASHLOAN_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        const flashLoanContract = new Contract(MORPHO_FLASHLOAN_ADDRESS, MORPHO_ABI, provider);
        try {
            const owner = await flashLoanContract.owner();
            const engine = await flashLoanContract.engine();
            console.log("--- Flash Loan Contract ---");
            console.log("Owner :", owner);
            console.log("Engine:", engine);
            console.log();
        } catch (e: any) {
            console.log("⚠️  Could not read flash loan contract:", e?.shortMessage || e?.message || String(e));
            console.log();
        }
    }

    // Check Morpho balance for each token
    console.log("--- Token Balances in Morpho ---");
    console.log("Token".padEnd(12) + "Balance".padEnd(25) + "Status");
    console.log("-".repeat(60));

    for (const token of TOKENS) {
        try {
            const erc20 = new Contract(token.address, ERC20_ABI, provider);
            const balance = await erc20.balanceOf(MORPHO_FLASHLOAN_ADDRESS);
            const formatted = formatUnits(balance, token.decimals);

            let status = "✅";
            if (balance === 0n) {
                status = "❌ EMPTY";
            } else if (token.name === "WETH" && balance < 3n * BigInt(10 ** token.decimals)) {
                status = `⚠️ LOW (< 3 ${token.name})`;
            }

            console.log(`${token.name.padEnd(12)}${formatted.padEnd(25)}${status}`);
        } catch (e: any) {
            console.log(`${token.name.padEnd(12)}${"?".padEnd(25)}❓ Error: ${e?.shortMessage || String(e).slice(0, 60)}`);
        }
    }

    console.log();

    // Specific check for the last failed flash loan amount
    const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
    const FLASH_AMOUNT = 2539841127778112512n; // ~2.54 WETH from the failed tx

    const weth = new Contract(WETH_ADDRESS, ERC20_ABI, provider);
    const wethBalance = await weth.balanceOf(MORPHO_FLASHLOAN_ADDRESS);

    console.log("====================================");
    console.log("--- Last Failed Flash Loan Check ---");
    console.log(`Flash amount: ${formatUnits(FLASH_AMOUNT, 18)} WETH`);
    console.log(`Morpho WETH : ${formatUnits(wethBalance, 18)} WETH`);

    if (wethBalance >= FLASH_AMOUNT) {
        console.log("✅ Morpho HAS enough WETH for this flash loan");
        console.log("   → Revert is likely during swap execution or minProfit check");
    } else {
        const deficit = FLASH_AMOUNT - wethBalance;
        console.log(`❌ Morpho MISSING ${formatUnits(deficit, 18)} WETH — flash loan will revert!`);
        console.log("   → This is the root cause of the revert");
    }
    console.log("====================================");
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
