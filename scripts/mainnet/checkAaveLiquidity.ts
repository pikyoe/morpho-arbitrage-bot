/**
 * checkAaveLiquidity.ts
 *
 * Checks Aave V3 pool liquidity on Base for flash loan availability.
 * Run with:
 *   ENV_FILE=.env.mainnet npx tsx scripts/mainnet/checkAaveLiquidity.ts
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
if (!RPC_URL) throw new Error("BASE_RPC_URL not set");

// Aave V3 Pool on Base
const AAVE_POOL = "0xA238dD80C259a72e81d7E4664a9801593F98d625";
// Aave V3 PoolDataProvider for reserve data
const AAVE_DATA_PROVIDER = "0x2d8A3C5677189734FABc2A2081c7b13D43561946";

const POOL_ABI = [
    "function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
    "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external",
    "function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)",
];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
];

const TOKENS: { name: string; address: string; decimals: number }[] = [
    { name: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { name: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { name: "USDbC", address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", decimals: 6 },
    { name: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
    { name: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 },
    { name: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", decimals: 6 },
    { name: "wstETH", address: "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", decimals: 18 },
];

async function main() {
    const provider = new JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();

    console.log("====================================");
    console.log("  AAVE V3 LIQUIDITY CHECK (Base)");
    console.log("====================================");
    console.log("Network:", network.name, `(chainId ${network.chainId})`);
    console.log("Pool   :", AAVE_POOL);
    console.log();

    // Check flash loan premium
    const pool = new Contract(AAVE_POOL, POOL_ABI, provider);
    try {
        const premium = await pool.FLASHLOAN_PREMIUM_TOTAL();
        const premiumBps = Number(premium);
        console.log(`Flash loan fee: ${premiumBps / 100}% (${premiumBps} bps)`);
        console.log();
    } catch {
        console.log("Could not read flash loan premium");
        console.log();
    }

    // Check each token reserve
    console.log("--- Aave V3 Reserve Liquidity ---");
    console.log("Token".padEnd(10) + "Available".padEnd(22) + "Utilization".padEnd(14) + "Status");
    console.log("-".repeat(70));

    for (const token of TOKENS) {
        try {
            const reserveData = await pool.getReserveData(token.address);

            // Available liquidity = aToken balance - total debt
            // aTokenAddress holds the total supplied
            const aToken = new Contract(reserveData.aTokenAddress, ERC20_ABI, provider);
            const totalSupply = await aToken.balanceOf("0x0000000000000000000000000000000000000000");

            // Get variable debt
            const variableDebtToken = new Contract(reserveData.variableDebtTokenAddress, ERC20_ABI, provider);
            const totalBorrow = await variableDebtToken.balanceOf("0x0000000000000000000000000000000000000000");

            // Available = supply - borrow
            const available = totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n;
            const formatted = formatUnits(available, token.decimals);

            // Utilization
            const utilPct = totalSupply > 0n
                ? Number((totalBorrow * 10000n) / totalSupply) / 100
                : 0;

            let status = "✅";
            if (available === 0n) {
                status = "❌ EMPTY";
            } else if (token.name === "WETH" && available < 5n * BigInt(10 ** token.decimals)) {
                status = "⚠️ LOW";
            }

            console.log(`${token.name.padEnd(10)}${formatted.padEnd(22)}${(utilPct.toFixed(1) + "%").padEnd(14)}${status}`);
        } catch (e: any) {
            console.log(`${token.name.padEnd(10)}${"?".padEnd(22)}${"?".padEnd(14)}❓ ${e?.shortMessage || String(e).slice(0, 50)}`);
        }
    }

    // Specific check for the flash loan amount that failed
    const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
    const FLASH_AMOUNT = 2539841127778112512n; // ~2.54 WETH

    console.log();
    console.log("====================================");
    console.log("--- Flash Loan Compatibility ---");

    try {
        const reserveData = await pool.getReserveData(WETH_ADDRESS);
        const aToken = new Contract(reserveData.aTokenAddress, ERC20_ABI, provider);
        const totalSupply = await aToken.balanceOf("0x0000000000000000000000000000000000000000");
        const variableDebtToken = new Contract(reserveData.variableDebtTokenAddress, ERC20_ABI, provider);
        const totalBorrow = await variableDebtToken.balanceOf("0x0000000000000000000000000000000000000000");
        const available = totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n;

        console.log(`Flash amount needed: ${formatUnits(FLASH_AMOUNT, 18)} WETH`);
        console.log(`Aave WETH available : ${formatUnits(available, 18)} WETH`);

        if (available >= FLASH_AMOUNT) {
            console.log("✅ Aave HAS enough WETH for this flash loan!");
            console.log("   → Consider switching to Aave as flash loan provider");
        } else {
            console.log(`❌ Aave MISSING ${formatUnits(FLASH_AMOUNT - available, 18)} WETH`);
        }
    } catch (e: any) {
        console.log("❓ Could not check:", e?.shortMessage || String(e).slice(0, 80));
    }

    // Morpho comparison
    console.log();
    console.log("--- Comparison with Morpho ---");
    const MORPHO_FLASHLOAN = "0x9372a039638Ff82eD316Bc8Ee5f0A888AcE039C8";
    const morphoWeth = new Contract(WETH_ADDRESS, ERC20_ABI, provider);
    const morphoBalance = await morphoWeth.balanceOf(MORPHO_FLASHLOAN);

    console.log(`Morpho WETH: ${formatUnits(morphoBalance, 18)}`);
    console.log(`Aave  WETH: (see above)`);

    if (morphoBalance === 0n) {
        console.log("→ Morpho empty, Aave is the better option");
    }
    console.log("====================================");
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
