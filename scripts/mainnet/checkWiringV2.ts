import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  // Use the older but still working API
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
  const morphoAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;
  const uniswapAdapterAddress = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
  const sushiSwapAdapterAddress = process.env.SUSHISWAP_ADAPTER_V2_ADDRESS;
  const pancakeSwapAdapterAddress = process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS;
  const aerodromeAdapterAddress = process.env.AERODROME_ADAPTER_V2_ADDRESS;

  if (!engineAddress || !morphoAddress) {
    throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS or MORPHO_FLASHLOAN_V2_ADDRESS missing");
  }

  // Validate addresses from env
  if (!ethers.isAddress(engineAddress)) {
    throw new Error("Invalid ARBITRAGE_ENGINE_V2_ADDRESS");
  }

  if (!ethers.isAddress(morphoAddress)) {
    throw new Error("Invalid MORPHO_FLASHLOAN_V2_ADDRESS");
  }

  if (uniswapAdapterAddress && !ethers.isAddress(uniswapAdapterAddress)) {
    throw new Error("Invalid UNISWAP_ADAPTER_V2_ADDRESS");
  }

  if (aerodromeAdapterAddress && !ethers.isAddress(aerodromeAdapterAddress)) {
    throw new Error("Invalid AERODROME_ADAPTER_V2_ADDRESS");
  }

  if (sushiSwapAdapterAddress && !ethers.isAddress(sushiSwapAdapterAddress)) {
    throw new Error("Invalid SUSHISWAP_ADAPTER_V2_ADDRESS");
  }

  if (pancakeSwapAdapterAddress && !ethers.isAddress(pancakeSwapAdapterAddress)) {
    throw new Error("Invalid PANCAKESWAP_ADAPTER_V2_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  const actualNetwork = await ethers.provider.getNetwork();
  if (actualNetwork.chainId !== 8453n) {
    throw new Error(`Wrong network: expected Base mainnet (8453), got ${actualNetwork.chainId}`);
  }

  console.log("==============================");
  console.log("Checking Wiring");
  console.log("==============================");
  console.log("Network : Base mainnet");
  console.log("Signer  :", signer.address);
  console.log("chainId :", actualNetwork.chainId.toString());
  console.log();

  const engine = await ethers.getContractAt("ArbitrageEngineV2", engineAddress);
  const morpho = await ethers.getContractAt("MorphoFlashLoanV2", morphoAddress);

  if (!(await engine.authorizedCaller(signer.address)) && signer.address.toLowerCase() !== (await engine.owner()).toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not authorized to execute on the engine`);
  }

  // Two-way wiring verification
  const engineMorpho = await engine.morphoFlashLoan();
  const morphoEngine = await morpho.engine();

  console.log("====================");
  console.log("ENGINE");
  console.log("====================");
  console.log("Engine -> Morpho:", engineMorpho);

  if (uniswapAdapterAddress) {
    console.log("Engine -> Uniswap adapter:", uniswapAdapterAddress);
  }
  if (aerodromeAdapterAddress) {
    console.log("Engine -> Aerodrome adapter:", aerodromeAdapterAddress);
  }

  for (const [name, address] of [
    ["SushiSwap", sushiSwapAdapterAddress],
    ["PancakeSwap", pancakeSwapAdapterAddress]
  ] as const) {
    if (!address) continue;
    const adapter: any = await ethers.getContractAt("UniswapV3AdapterV2", address);
    const adapterEngine = await adapter.engine();
    console.log(`${name} adapter -> Engine:`, adapterEngine);
    if (adapterEngine.toLowerCase() !== engineAddress.toLowerCase()) {
      throw new Error(`${name} adapter wired incorrectly`);
    }
  }

  // Verify immutable router addresses used by each adapter.
  const routerChecks = [
    ["Uniswap", uniswapAdapterAddress, process.env.UNISWAP_ROUTER_ADDRESS],
    ["SushiSwap", sushiSwapAdapterAddress, process.env.SUSHISWAP_ROUTER],
    ["PancakeSwap", pancakeSwapAdapterAddress, process.env.PANCAKESWAP_ROUTER_ADDRESS],
    ["Aerodrome", aerodromeAdapterAddress, process.env.AERODROME_ROUTER_ADDRESS]
  ] as const;
  for (const [name, address, expectedRouter] of routerChecks) {
    if (!address || !expectedRouter) continue;
    const abiName = name === "Aerodrome" ? "AerodromeAdapterV2" : "UniswapV3AdapterV2";
    const adapter: any = await ethers.getContractAt(abiName, address);
    const actualRouter = await adapter.router();
    console.log(`${name} adapter router:`, actualRouter);
    if (actualRouter.toLowerCase() !== expectedRouter.toLowerCase()) {
      throw new Error(`${name} adapter router mismatch`);
    }
  }

  console.log("====================");
  console.log("MORPHO FLASHLOAN");
  console.log("====================");
  console.log("Morpho -> Engine:", morphoEngine);

  if (engineMorpho.toLowerCase() !== morphoAddress.toLowerCase()) {
    throw new Error("Engine points to wrong Morpho");
  }

  if (morphoEngine.toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("Morpho points to wrong Engine");
  }

  if (uniswapAdapterAddress) {
    const uniswapAdapter: any = await ethers.getContractAt("UniswapV3AdapterV2", uniswapAdapterAddress);
    const uniEngine = await uniswapAdapter.engine();

    console.log("Uniswap adapter -> Engine:", uniEngine);

    if (uniEngine.toLowerCase() !== engineAddress.toLowerCase()) {
      throw new Error("Uniswap adapter wired incorrectly");
    }
  }

  if (aerodromeAdapterAddress) {
    const aerodromeAdapter: any = await ethers.getContractAt("AerodromeAdapterV2", aerodromeAdapterAddress);
    const aeroEngine = await aerodromeAdapter.engine();

    console.log("Aerodrome adapter -> Engine:", aeroEngine);

    if (aeroEngine.toLowerCase() !== engineAddress.toLowerCase()) {
      throw new Error("Aerodrome adapter wired incorrectly");
    }
  }

  for (const [name, address] of [
    ["SushiSwap", sushiSwapAdapterAddress],
    ["PancakeSwap", pancakeSwapAdapterAddress]
  ] as const) {
    if (!address) continue;
    const approved = await engine.approvedAdapter(address);
    console.log(`${name}:`, approved);
    if (!approved) console.warn(`${name} adapter not approved`);
  }

  console.log("====================");
  console.log("APPROVED ADAPTERS");
  console.log("====================");

  if (uniswapAdapterAddress) {
    try {
      const approvedUniswap = await engine.approvedAdapter(uniswapAdapterAddress);
      console.log("Uniswap:", approvedUniswap);

      if (!approvedUniswap) {
        console.warn("⚠️ Uniswap adapter not approved");
      }
    } catch (error) {
      console.warn("⚠️ Could not check Uniswap adapter approval:", error);
    }
  }

  if (aerodromeAdapterAddress) {
    try {
      const approvedAerodrome = await engine.approvedAdapter(aerodromeAdapterAddress);
      console.log("Aerodrome:", approvedAerodrome);

      if (!approvedAerodrome) {
        console.warn("⚠️ Aerodrome adapter not approved");
      }
    } catch (error) {
      console.warn("⚠️ Could not check Aerodrome adapter approval:", error);
    }
  }

  for (const [name, address] of [
    ["SushiSwap", sushiSwapAdapterAddress],
    ["PancakeSwap", pancakeSwapAdapterAddress]
  ] as const) {
    if (!address) continue;
    try {
      const approved = await engine.approvedAdapter(address);
      console.log(`${name}:`, approved);

      if (!approved) {
        console.warn(`⚠️ ${name} adapter not approved on the engine`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not check ${name} adapter approval:`, error);
    }
  }

  console.log("====================");
  console.log("OWNERS");
  console.log("====================");

  console.log("Morpho owner:", await morpho.owner());
  console.log("Engine owner:", await engine.owner());

  console.log("====================");
  console.log("PAUSE STATUS");
  console.log("====================");

  console.log("Engine paused:", await engine.paused());
  console.log("Morpho paused:", await morpho.paused());

  const WETH = "0x4200000000000000000000000000000000000006";
  const weth = new ethers.Contract(
    WETH,
    [
      "function balanceOf(address) view returns (uint256)",
      "function symbol() view returns (string)"
    ],
    ethers.provider
  );

  console.log("====================");
  console.log("WETH BALANCES");
  console.log("====================");

  console.log("Morpho:", await weth.balanceOf(morphoAddress));
  console.log("Engine:", await weth.balanceOf(engineAddress));

  const profitReceiver = await engine.profitReceiver();

  console.log("Engine profitReceiver:", profitReceiver);

  console.log("✓ Wiring verified");

  console.log("====================");
  console.log("ENGINE IDLE / FLASHLOAN STATUS");
  console.log("====================");
  console.log("flashLoanToken:", await engine.flashLoanToken());
  console.log(
    "flashLoanAmount:",
    (await engine.flashLoanAmount()).toString()
  );

  console.log("====================");
  console.log("AUTHORIZED CALLER SAMPLE");
  console.log("====================");

  const sampleAddress = process.env.SAMPLE_AUTHORIZED_ADDRESS;
  if (sampleAddress) {
    console.log("Authorized sample:", await engine.authorizedCaller(sampleAddress));
  } else {
    console.log("No SAMPLE_AUTHORIZED_ADDRESS set for authorization check.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
