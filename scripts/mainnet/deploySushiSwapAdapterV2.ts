import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  await ensureChain([8453n, 31337n, 84532n], connection);

  const [deployer] = await ethers.getSigners();
  const networkName = (hre.network as any).name ?? "unknown";
  const chainId = (hre.network as any).config?.chainId ?? "unknown";
  const owner = process.env.ADAPTER_OWNER_ADDRESS || deployer.address;
  const router = process.env.SUSHISWAP_ROUTER;
  const engine = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

  if (!owner || !ethers.isAddress(owner) || owner === ethers.ZeroAddress) {
    throw new Error("ADAPTER_OWNER_ADDRESS is missing or invalid");
  }
  if (!router || !ethers.isAddress(router) || router === ethers.ZeroAddress) {
    throw new Error("SUSHISWAP_ROUTER is missing or invalid");
  }
  if (!engine || !ethers.isAddress(engine) || engine === ethers.ZeroAddress) {
    throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS is missing or invalid");
  }

  console.log("Network:", networkName);
  console.log("Chain ID:", chainId);
  console.log("Signer:", deployer.address);
  console.log("Owner:", owner);
  console.log("Router:", router);
  console.log("Engine:", engine);

  // SushiSwap V3 on Base (0xFB7eF66a...) is a PancakeSwap V3 SwapRouter
  // deployment: exactInputSingle keeps `deadline` inside the params struct
  // (0x414bf389) and does NOT implement the SwapRouter02-style signature used
  // by UniswapV3AdapterV2. Deploy the PancakeSwap-style adapter.
  const Factory = await ethers.getContractFactory("PancakeSwapV3AdapterV2");
  const adapter = await Factory.deploy(owner, router, engine);
  await adapter.waitForDeployment();

  console.log("SushiSwap adapter implementation: PancakeSwapV3AdapterV2");
  console.log("SushiSwapAdapterV2:", await adapter.getAddress());
  console.log("Next steps:");
  console.log("  1. Set SUSHISWAP_ADAPTER_V2_ADDRESS to the address above");
  console.log("  2. Approve it on the engine: setApprovedAdapter(<address>, true)");
  console.log("  3. Optionally unapprove the old adapter (setApprovedAdapter(old, false))");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
