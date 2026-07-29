import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import dotenv from "dotenv";

const args = process.argv;
const networkArgIndex = args.findIndex((arg) => arg === "--network");
let networkName: string | undefined;

if (networkArgIndex !== -1 && args.length > networkArgIndex + 1) {
  networkName = args[networkArgIndex + 1];
} else {
  const networkArg = args.find((arg) => arg.startsWith("--network="));
  if (networkArg) {
    networkName = networkArg.split("=")[1];
  }
}

const envFile =
  process.env.ENV_FILE ||
  (networkName && /sepolia/i.test(networkName)
    ? ".env.sepolia"
    : ".env.mainnet");

dotenv.config({ path: envFile });

console.log(`Loaded env file: ${envFile}`);
export default defineConfig({
  plugins: [hardhatEthers],

  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },

  networks: {
  base: {
    type: "http",
    chainType: "op",
    url: process.env.BASE_RPC_URL || "",
    accounts: process.env.PRIVATE_KEY
      ? [process.env.PRIVATE_KEY]
      : [],
    },

  baseSepolia: {
    type: "http",
    chainType: "op",
    url: process.env.BASE_SEPOLIA_RPC_URL || "",
    accounts: process.env.PRIVATE_KEY
      ? [process.env.PRIVATE_KEY]
      : [],
    },
  },
});