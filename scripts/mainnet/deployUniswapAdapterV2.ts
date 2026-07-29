import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  ensureChain(8453n);

  const [deployer] = await ethers.getSigners();
  const networkName = (hre.network as any).name ?? "unknown";
  const chainId = (hre.network as any).config?.chainId ?? "unknown";
  console.log("Network:", networkName, "chainId:", chainId);
  console.log("Signer:", deployer.address);

  const Factory = await ethers.getContractFactory("UniswapV3AdapterV2");

  const router = process.env.UNISWAP_ROUTER_ADDRESS;
  if (!router) {
    throw new Error("UNISWAP_ROUTER_ADDRESS missing");
  }
  if (!ethers.isAddress(router)) {
    throw new Error("Invalid UNISWAP_ROUTER_ADDRESS");
  }

  const adapter = await Factory.deploy(deployer.address, router);

    await adapter.waitForDeployment();

    console.log(
        "UniswapAdapter:",
        await adapter.getAddress()
    );

}

main().catch(console.error);