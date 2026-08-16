import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

// 1inch AggregationRouterV6 — same canonical address on every EVM chain
// (EIP-55 checksummed). Override with INCH_ROUTER_ADDRESS in the env file if
// it ever differs.
const INCH_ROUTER_DEFAULT = "0x1111111254EEB2542b083CD3d89929CA9e0D33F3";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  await ensureChain([8453n, 31337n, 84532n], connection);

  // Safety net: hardhat's configured chainId can disagree with the live RPC
  // (e.g. BASE_RPC_URL pointing at a Sepolia endpoint). The RPC is the truth.
  const liveChainId = BigInt((await connection.provider.getNetwork()).chainId);
  const configuredChainId = BigInt((hre.network as any).config?.chainId ?? liveChainId);
  if (configuredChainId !== liveChainId) {
    console.warn("⚠️⚠️⚠️ CONFIG CHAIN ID MISMATCH ⚠️⚠️⚠️");
    console.warn(`   Hardhat config says chainId ${configuredChainId}, but the live RPC says ${liveChainId}.`);
    console.warn("   This deploy will go to the LIVE RPC chain. Check BASE_RPC_URL in the env file!");
  }

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

  // Normalize to the EIP-55 checksum form so lowercase/mixed-case env values work.
  const routerChecksummed = ethers.getAddress(router);

  console.log("Network:", networkName);
  console.log("Chain ID (live RPC):", liveChainId.toString());
  console.log("Signer:", deployer.address);
  console.log("Owner:", owner);
  console.log("Router:", routerChecksummed);
  console.log("Engine:", engine);

  const Factory = await ethers.getContractFactory("OneInchAdapterV2");
  const adapter = await Factory.deploy(owner, routerChecksummed, engine);
  await adapter.waitForDeployment();

  console.log("OneInchAdapterV2:", await adapter.getAddress());
  console.log("Next steps:");
  console.log("  1. Add the adapter address to .env.mainnet as INCH_ADAPTER_V2_ADDRESS");
  console.log("  2. Approve it on the engine (reads INCH_ADAPTER_V2_ADDRESS, sends the tx):");
  console.log("     DRY_RUN=false npx hardhat run scripts/mainnet/setApprovedAdapterV2.ts --network base");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
