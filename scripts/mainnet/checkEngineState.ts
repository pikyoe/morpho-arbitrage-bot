/**
 * checkEngineState.ts
 *
 * Read-only diagnostic: queries ArbitrageEngineV2 on-chain state.
 * Run with:
 *   ENV_FILE=.env.mainnet npx tsx scripts/mainnet/checkEngineState.ts
 */

import * as dotenv from "dotenv";
import { JsonRpcProvider, Contract } from "ethers";

if (!process.env.ENV_FILE) {
    dotenv.config({ path: ".env.mainnet" });
}
if (process.env.ENV_FILE) {
    dotenv.config({ path: process.env.ENV_FILE });
}

const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL;
const ENGINE_ADDRESS = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

if (!RPC_URL) throw new Error("BASE_RPC_URL not set");
if (!ENGINE_ADDRESS) throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS not set");

const ENGINE_ABI = [
    "function owner() view returns (address)",
    "function paused() view returns (bool)",
    "function flashLoanToken() view returns (address)",
    "function flashLoanAmount() view returns (uint256)",
    "function flashLoanInitiator() view returns (address)",
    "function authorizedCaller(address) view returns (bool)",
    "function approvedAdapter(address) view returns (bool)",
    "function profitReceiver() view returns (address)",
    "function morphoFlashLoan() view returns (address)",
];

async function main() {
    const provider = new JsonRpcProvider(RPC_URL);
    const engine = new Contract(ENGINE_ADDRESS, ENGINE_ABI, provider);

    const network = await provider.getNetwork();
    console.log("====================================");
    console.log("  ENGINE STATE DIAGNOSTIC");
    console.log("====================================");
    console.log("Network    :", network.name, `(chainId ${network.chainId})`);
    console.log("Engine     :", ENGINE_ADDRESS);
    console.log();

    // ---- Core state ----
    const owner = await engine.owner();
    const paused = await engine.paused();
    const flashLoanToken = await engine.flashLoanToken();
    const flashLoanAmount = await engine.flashLoanAmount();
    const flashLoanInitiator = await engine.flashLoanInitiator();
    const profitReceiver = await engine.profitReceiver();
    const morpho = await engine.morphoFlashLoan();

    console.log("--- Owner & Config ---");
    console.log("Owner          :", owner);
    console.log("ProfitReceiver :", profitReceiver);
    console.log("MorphoFlashLoan:", morpho);
    console.log();

    console.log("--- Pause State ---");
    console.log("Paused:", paused ? "⚠️  YES — executeArbitrage will revert!" : "✅ NO");
    console.log();

    console.log("--- Flash Loan State ---");
    const loanStuck =
        flashLoanToken !== "0x0000000000000000000000000000000000000000" ||
        flashLoanAmount !== 0n;
    console.log("flashLoanToken    :", flashLoanToken);
    console.log("flashLoanAmount   :", flashLoanAmount.toString());
    console.log("flashLoanInitiator:", flashLoanInitiator);
    if (loanStuck) {
        console.log("⚠️  STUCK — flashLoanToken/Amount non-zero. executeArbitrage will revert!");
    } else {
        console.log("✅ Clean (no in-progress flash loan)");
    }
    console.log();

    // ---- Bot wallet authorization ----
    const BOT_WALLET = process.env.PRIVATE_KEY
        ? new (await import("ethers")).Wallet(process.env.PRIVATE_KEY, provider).address
        : null;

    console.log("--- Authorization ---");
    if (BOT_WALLET) {
        const isAuthorized = await engine.authorizedCaller(BOT_WALLET);
        console.log(`Bot wallet (${BOT_WALLET}):`, isAuthorized ? "✅ Authorized" : "❌ NOT authorized — executeArbitrage will revert!");
    } else {
        console.log("PRIVATE_KEY not set — cannot check bot wallet authorization");
    }
    const ownerAuthorized = await engine.authorizedCaller(owner);
    console.log(`Owner wallet (${owner.slice(0, 8)}…):`, ownerAuthorized ? "✅ Authorized" : "❌ NOT authorized");
    console.log();

    // ---- Adapter approvals ----
    const ADAPTERS: [string, string][] = [
        ["Uniswap", process.env.UNISWAP_ADAPTER_V2_ADDRESS || ""],
        ["SushiSwap", process.env.SUSHISWAP_ADAPTER_V2_ADDRESS || ""],
        ["PancakeSwap", process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS || ""],
        ["Aerodrome", process.env.AERODROME_ADAPTER_V2_ADDRESS || ""],
        ["1inch", process.env.INCH_ADAPTER_V2_ADDRESS || ""],
    ];

    console.log("--- Adapter Approvals ---");
    for (const [name, addr] of ADAPTERS) {
        if (!addr) {
            console.log(`${name.padEnd(14)}: ⚪ Not configured (env var empty)`);
            continue;
        }
        try {
            const approved = await engine.approvedAdapter(addr);
            console.log(`${name.padEnd(14)}: ${approved ? "✅ Approved" : "❌ NOT approved"} (${addr.slice(0, 10)}…)`);
        } catch (e: any) {
            console.log(`${name.padEnd(14)}: ❓ Query failed (${e?.shortMessage || e?.message || String(e)})`);
        }
    }
    console.log();

    // ---- Summary ----
    const issues: string[] = [];
    if (paused) issues.push("Engine is PAUSED");
    if (loanStuck) issues.push("Flash loan state STUCK");
    if (BOT_WALLET && !(await engine.authorizedCaller(BOT_WALLET))) {
        issues.push("Bot wallet NOT authorized");
    }

    console.log("====================================");
    if (issues.length === 0) {
        console.log("✅ ALL CHECKS PASSED — engine should be executable");
    } else {
        console.log("⚠️  ISSUES FOUND:");
        for (const issue of issues) {
            console.log(`   ❌ ${issue}`);
        }
    }
    console.log("====================================");
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
