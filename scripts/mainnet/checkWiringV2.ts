import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
  const morphoAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;
  const uniswapAdapterAddress = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
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

  const [signer] = await ethers.getSigners();

  console.log("==============================");
  console.log("Checking Wiring");
  console.log("==============================");
  const networkName = ((hre.network as any).name ?? "unknown") as string;
  const chainId = ((hre.network as any).config?.chainId ?? "unknown") as string;
  console.log("Network :", networkName);
  console.log("Signer  :", signer.address);
  console.log("chainId :", chainId);
  console.log();

  const engine = await ethers.getContractAt("ArbitrageEngineV2", engineAddress);
  const morpho = await ethers.getContractAt("MorphoFlashLoanV2", morphoAddress);

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
    console.log("Uniswap adapter -> Engine:", await uniswapAdapter.engine());
  }

  if (aerodromeAdapterAddress) {
    const aerodromeAdapter: any = await ethers.getContractAt("AerodromeAdapterV2", aerodromeAdapterAddress);
    console.log("Aerodrome adapter -> Engine:", await aerodromeAdapter.engine());
  }

  const engineOwner = await engine.owner();
  const profitReceiver = await engine.profitReceiver();

  console.log("Engine owner:", engineOwner);
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
