import { Contract } from "ethers";
import { signer } from "../config/provider.js";
const ABI = [
    "function executeArbitrage(address tokenBorrow,uint256 amount,address tokenMid,uint24 fee1,uint24 fee2) external"
];
const engine = new Contract(process.env.ARBITRAGE_ENGINE, ABI, signer);
export async function execute(amount) {
    console.log();
    console.log("==============================");
    console.log("EXECUTING");
    console.log("==============================");
    const tx = await engine.executeArbitrage("0x4200000000000000000000000000000000000006", amount, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 3000, 3000);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("SUCCESS");
}
