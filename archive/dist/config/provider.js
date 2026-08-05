import { JsonRpcProvider, Wallet } from "ethers";
import "./env.js";
export const provider = new JsonRpcProvider(process.env.BASE_RPC_URL);
export const signer = new Wallet(process.env.PRIVATE_KEY, provider);
