import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

// 1inch AggregationRouterV6 — same canonical address on every EVM chain.
// Override with INCH_ROUTER_ADDRESS in the env file if it ever differs.
const INCH_ROUTER_DEFAULT = "0x1111111254EEB2542B083cd3d89929cA9e0d33F3";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  await ensureChain([8453n, 31337n, 84532n], connection);

  const [deployer] = await ethers.getSigners();
  const networkName = (hre.network as any).name ?? "unknown";
  const chainId = (hre.network as any).config?.chainId ?? "unknown";
  const owner = process.env.ADAPTER_OWNER_ADDRESS || deployer.address;
  const router = process.env.INCH_ROUTER_ADDRESS || INCH_ROUTER_DEFAULT;
  const engine = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

  if (!owner || !ethers.isAddress(owner) || owner === ethers.ZeroAddress) {
    throw new Error("ADAPTER_OWNER_ADDRESS is missing or invalid");
  }
  if (!router || !ethers.isAddress(router) || router === ethers.ZeroAddress) {
    throw new Error("INCH_ROUTER_ADDRESS is missing or invalid");
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

  const Factory = await ethers.getContractFactory("OneInchAdapterV2");
  const adapter = await Factory.deploy(owner, router, engine);
  await adapter.waitForDeployment();

  console.log("OneInchAdapterV2:", await adapter.getAddress());
  console.log("Next steps:");
  console.log("  1. Add the adapter address to .env.mainnet as INCH_ADAPTER_V2_ADDRESS");
  console.log("  2. Approve it on the engine: ADAPTER_ADDRESS=<addr> DRY_RUN=false npx tsx scripts/mainnet/setApprovedAdapterV2.ts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
