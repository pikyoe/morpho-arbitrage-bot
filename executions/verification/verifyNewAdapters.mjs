import { JsonRpcProvider, Contract, getAddress } from "ethers";

const provider = new JsonRpcProvider(process.env.BASE_RPC_URL);
const ENGINE_ABI = [
  "function owner() view returns (address)",
  "function approvedAdapter(address) view returns (bool)",
  "function morphoFlashLoan() view returns (address)"
];
const ADAPTER_ABI = [
  "function owner() view returns (address)",
  "function engine() view returns (address)",
  "function router() view returns (address)"
];

const expectedOwner = getAddress("0x5E2F886b10a49685317De61f521b0Cfa59579d60");
const engineAddr = getAddress(process.env.ARBITRAGE_ENGINE_V2_ADDRESS);
const sushi = getAddress(process.env.SUSHISWAP_ADAPTER_V2_ADDRESS);
const pancake = getAddress(process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS);
const engine = new Contract(engineAddr, ENGINE_ABI, provider);

for (const [name, addr] of [["sushi", sushi], ["pancake", pancake]]) {
  const code = await provider.getCode(addr);
  const adapter = new Contract(addr, ADAPTER_ABI, provider);
  const owner = getAddress(await adapter.owner());
  const eng = getAddress(await adapter.engine());
  const router = getAddress(await adapter.router());
  const approved = await engine.approvedAdapter(addr);
  console.log(`${name} adapter:`);
  console.log(`  address=${addr}`);
  console.log(`  bytecode=${code !== "0x" ? "present" : "MISSING"}`);
  console.log(`  owner=${owner} matchExpected=${owner === expectedOwner}`);
  console.log(`  engine=${eng} matchEngine=${eng === engineAddr}`);
  console.log(`  router=${router}`);
  console.log(`  approvedAdapter=${approved}`);
}
