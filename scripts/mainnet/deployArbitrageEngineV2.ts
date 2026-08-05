import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  // ensureChain([8453n, 31337n, 84532n], connection); // Temporarily disabled

  const [deployer] = await ethers.getSigners();
  const networkName = (hre.network as any).name ?? "unknown";
  const chainId = (hre.network as any).config?.chainId ?? "unknown";
  console.log("Network:", networkName, "chainId:", chainId);
  console.log("Signer:", deployer.address);

  const morphoFlashLoan = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;

  if (!morphoFlashLoan) {
    throw new Error("MORPHO_FLASHLOAN_V2_ADDRESS missing");
  }

  if (!ethers.isAddress(morphoFlashLoan)) {
    throw new Error("Invalid MORPHO_FLASHLOAN_V2_ADDRESS");
  }

  const uniswapAdapter = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
  if (!uniswapAdapter) {
    throw new Error("UNISWAP_ADAPTER_V2_ADDRESS missing");
  }

  const aerodromeAdapter = process.env.AERODROME_ADAPTER_V2_ADDRESS;
  if (!aerodromeAdapter) {
    throw new Error("AERODROME_ADAPTER_V2_ADDRESS missing");
  }

  console.log("Deploying ArbitrageEngineV2...");
  console.log("Owner:", deployer.address);
  console.log("MorphoFlashLoanV2:", morphoFlashLoan);
  console.log("UniswapAdapterV2:", uniswapAdapter);
  console.log("AerodromeAdapterV2:", aerodromeAdapter);

  const Factory = await ethers.getContractFactory("ArbitrageEngineV2");
  const engine = await Factory.deploy(
    deployer.address, // initialOwner
    morphoFlashLoan,
    deployer.address, // profit receiver
    uniswapAdapter,
    aerodromeAdapter
  );

  await engine.waitForDeployment();

  console.log("==============================");
  console.log("ArbitrageEngineV2:", await engine.getAddress());
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
