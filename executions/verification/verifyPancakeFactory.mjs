import { JsonRpcProvider, Contract, getAddress, Interface } from "ethers";

const provider = new JsonRpcProvider(process.env.BASE_RPC_URL);
const factoryAddr = process.env.PANCAKESWAP_FACTORY_ADDRESS;

console.log("factory:", factoryAddr);
const code = await provider.getCode(factoryAddr);
console.log("bytecode:", code === "0x" ? "EMPTY (no contract!)" : `present (${code.length} chars)`);

const iface = new Interface(["function getPool(address,address,uint24) view returns (address)"]);
console.log("selector getPool(address,address,uint24):", iface.getFunction("getPool").selector);

const factory = new Contract(factoryAddr, ["function getPool(address,address,uint24) view returns (address)"], provider);
const WETH = getAddress(process.env.WETH_ADDRESS || "0x4200000000000000000000000000000000000006");
const USDC = getAddress(process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
const EURC = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
const ZRO = "0x6985884c4392d348587b19cb9eaaf157f13271cd";

const tests = [
  ["WETH/USDC fee=500", WETH, USDC, 500],
  ["EURC/ZRO fee=500", EURC, ZRO, 500],
  ["USDC/WETH fee=100", USDC, WETH, 100],
];
for (const [label, a, b, fee] of tests) {
  try {
    const p = await factory.getPool(a, b, fee);
    console.log(`${label} -> ${p}`);
  } catch (e) {
    console.log(`${label} -> REVERT: ${e.shortMessage || e.message}`);
  }
}