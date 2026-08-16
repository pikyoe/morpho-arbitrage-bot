import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
<<<<<<< HEAD
  ensureChain([8453n, 31337n, 84532n], connection);
=======
  ensureChain(8453n);
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995

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

<<<<<<< HEAD
  // For now, use deployer address as placeholder for engine (will be set later)
  const adapter = await Factory.deploy(deployer.address, router, deployer.address);
=======
  const adapter = await Factory.deploy(deployer.address, router);
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995

    await adapter.waitForDeployment();

    console.log(
        "UniswapAdapter:",
        await adapter.getAddress()
    );

}

main().catch(console.error);