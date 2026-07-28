import { parseEther } from "ethers";
import { TRADE_CONFIG } from "../config/trading.js";
export function getAmounts() {
    return TRADE_CONFIG.AMOUNTS.map(amount => parseEther(amount));
}
