import hre from "hardhat";
import loadEnvForNetwork from "./utils/loadEnv.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);

  const router = process.env.UNISWAP_ROUTER_ADDRESS ?? "(not set)";
  const factory = process.env.UNISWAP_FACTORY ?? "(not set)";
  const morpho = process.env.MORPHO_ADDRESS ?? "(not set)";

  const [deployer] = await ethers.getSigners();

  console.log("==============================");
  console.log("DEPLOY DRY RUN");
  console.log("==============================");
  console.log("Network:", ((hre.network as any).name ?? "unknown") as string);
  console.log("ChainId:", ((hre.network as any).config?.chainId ?? "unknown") as string);
  console.log("Owner:", deployer.address);
  console.log("Router:", router);
  console.log("Factory:", factory);
  console.log("Morpho:", morpho);
  console.log("==============================");

  if (router !== "(not set)" && !ethers.isAddress(router)) {
    console.warn("WARNING: UNISWAP_ROUTER_ADDRESS is not a valid address.");
  }

  if (factory !== "(not set)" && factory !== "(not set)" && !ethers.isAddress(factory)) {
    console.warn("WARNING: UNISWAP_FACTORY is not a valid address.");
  }

  if (morpho !== "(not set)" && !ethers.isAddress(morpho)) {
    console.warn("WARNING: MORPHO_ADDRESS is not a valid address.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});