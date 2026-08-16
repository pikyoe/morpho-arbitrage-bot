export {};

declare module "hardhat/types/network" {
  interface NetworkConnection<ChainTypeT extends import("hardhat/types/network").ChainType | string = import("hardhat/types/network").DefaultChainType> {
    ethers: any;
  }
}
