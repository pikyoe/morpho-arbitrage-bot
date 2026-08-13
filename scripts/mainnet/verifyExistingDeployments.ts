import "dotenv/config";
import * as dotenv from "dotenv";
import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";

const DEPLOYER = "0x5E2F886b10a49685317De61f521b0Cfa59579d60";
const ENGINE_ABI = [
  "function owner() view returns (address)",
  "function approvedAdapter(address) view returns (bool)",
  "function morphoFlashLoan() view returns (address)",
  "function authorizedCaller(address) view returns (bool)"
];
const ADAPTER_ABI = [
  "function owner() view returns (address)",
  "function engine() view returns (address)",
  "function router() view returns (address)"
];

type AddressMap = Record<string, string>;

function loadConfiguredAddresses(): AddressMap {
  if (process.env.ENV_FILE) {
    const result = dotenv.config({ path: process.env.ENV_FILE });
    if (result.error) throw new Error(`Unable to load ${process.env.ENV_FILE}: ${result.error.message}`);
  }

  const keys = [
    "MORPHO_FLASHLOAN_V2_ADDRESS",
    "ARBITRAGE_ENGINE_V2_ADDRESS",
    "UNISWAP_ADAPTER_V2_ADDRESS",
    "AERODROME_ADAPTER_V2_ADDRESS",
    "UNISWAP_ROUTER_ADDRESS",
    "AERODROME_ROUTER_ADDRESS",
    "AERODROME_ROUTER"
  ];
  const result: AddressMap = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) result[key] = value;
  }
  return result;
}

function assertAddress(name: string, value: string | undefined): string {
  if (!value || !isAddress(value)) throw new Error(`${name} is missing or invalid`);
  return getAddress(value);
}

async function main() {
  const configured = loadConfiguredAddresses();
  const rpcUrl = process.env.BASE_RPC_URL || process.env.RPC_URL;
  if (!rpcUrl) throw new Error("BASE_RPC_URL or RPC_URL is missing");

  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base chain 8453, got ${network.chainId}`);
  }

  const addresses = {
    morphoFlashLoan: assertAddress("MORPHO_FLASHLOAN_V2_ADDRESS", configured.MORPHO_FLASHLOAN_V2_ADDRESS),
    engine: assertAddress("ARBITRAGE_ENGINE_V2_ADDRESS", configured.ARBITRAGE_ENGINE_V2_ADDRESS),
    uniswapAdapter: assertAddress("UNISWAP_ADAPTER_V2_ADDRESS", configured.UNISWAP_ADAPTER_V2_ADDRESS),
    aerodromeAdapter: assertAddress("AERODROME_ADAPTER_V2_ADDRESS", configured.AERODROME_ADAPTER_V2_ADDRESS)
  };

  console.log(`Network: Base (${network.chainId})`);
  for (const [name, address] of Object.entries(addresses)) {
    const code = await provider.getCode(address);
    console.log(`${name}: ${address} bytecode=${code !== "0x" ? "present" : "missing"}`);
  }

  const engine = new Contract(addresses.engine, ENGINE_ABI, provider);
  const expectedOwner = getAddress(DEPLOYER);
  const owner = getAddress(await engine.owner());
  const morpho = getAddress(await engine.morphoFlashLoan());
  const authorized = await engine.authorizedCaller(expectedOwner);
  const approvedUniswap = await engine.approvedAdapter(addresses.uniswapAdapter);
  const approvedAerodrome = await engine.approvedAdapter(addresses.aerodromeAdapter);

  console.log(`engine.owner: ${owner} matchExpected=${owner === expectedOwner}`);
  console.log(`engine.morphoFlashLoan: ${morpho} matchConfigured=${morpho === addresses.morphoFlashLoan}`);
  console.log(`engine.authorizedCaller(deployer): ${authorized}`);
  console.log(`engine.approvedAdapter(uniswap): ${approvedUniswap}`);
  console.log(`engine.approvedAdapter(aerodrome): ${approvedAerodrome}`);

  for (const [name, address] of [
    ["uniswapAdapter", addresses.uniswapAdapter],
    ["aerodromeAdapter", addresses.aerodromeAdapter]
  ] as const) {
    const adapter = new Contract(address, ADAPTER_ABI, provider);
    const adapterOwner = getAddress(await adapter.owner());
    const adapterEngine = getAddress(await adapter.engine());
    const router = getAddress(await adapter.router());
    const expectedRouter = name === "uniswapAdapter"
      ? configured.UNISWAP_ROUTER_ADDRESS
      : configured.AERODROME_ROUTER_ADDRESS || configured.AERODROME_ROUTER;
    console.log(`${name}.owner: ${adapterOwner} matchExpected=${adapterOwner === expectedOwner}`);
    console.log(`${name}.engine: ${adapterEngine} matchEngine=${adapterEngine === addresses.engine}`);
    console.log(`${name}.router: ${router} matchConfigured=${expectedRouter ? router === getAddress(expectedRouter) : "unavailable"}`);
  }

  console.log("Creation transaction: unavailable from standard Base RPC provider");
}

main().catch((error) => {
  console.error(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
