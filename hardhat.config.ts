import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import dotenv from "dotenv";

dotenv.config({
  path: process.env.ENV_FILE || ".env.mainnet",
});
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