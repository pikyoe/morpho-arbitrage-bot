import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/src/types";

declare module "hardhat/types/network" {
  interface NetworkConnection {
    ethers: HardhatEthers;
  }
}
