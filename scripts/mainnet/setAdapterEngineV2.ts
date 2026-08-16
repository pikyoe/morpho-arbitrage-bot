<<<<<<< HEAD
import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  const adapterAddress = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

  if (!adapterAddress || !engineAddress) {
    throw new Error("UNISWAP_ADAPTER_V2_ADDRESS or ARBITRAGE_ENGINE_V2_ADDRESS missing");
  }

  // Validate addresses from env
  if (!ethers.isAddress(adapterAddress)) {
    throw new Error("Invalid UNISWAP_ADAPTER_V2_ADDRESS");
  }

  if (!ethers.isAddress(engineAddress)) {
    throw new Error("Invalid ARBITRAGE_ENGINE_V2_ADDRESS");
  }

  // Show network and signer info
  const networkName = ((hre.network as any).name ?? "unknown") as string;
  const chainId = ((hre.network as any).config?.chainId ?? "unknown") as string;
  console.log("Network:", networkName, "chainId:", chainId);
  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const adapterBefore: any = await ethers.getContractAt("UniswapV3AdapterV2", adapterAddress);
  const currentEngineBefore = await adapterBefore.engine();
  console.log("Current engine before:", currentEngineBefore);

  console.log("Setting UniswapV3AdapterV2 engine to:", engineAddress);

  const adapterWithSigner: any = adapterBefore.connect(deployer);
  const tx = await adapterWithSigner.setEngine(engineAddress);
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction Status:", receipt.status === 1 ? "Success" : "Failed");

  if (receipt.status !== 1) {
    throw new Error("Transaction failed");
  }

  // Verify contract state after transaction with fresh contract instance
  try {
    const adapterAfter: any = await ethers.getContractAt("UniswapV3AdapterV2", adapterAddress);
    const currentEngine = await adapterAfter.engine();

    if (currentEngine.toLowerCase() !== engineAddress.toLowerCase()) {
      console.warn("⚠️ Engine verification failed, but transaction succeeded");
      console.log("Expected:", engineAddress);
      console.log("Got:", currentEngine);
    } else {
      console.log("Verified engine:", currentEngine);
    }
  } catch (error) {
    console.warn("⚠️ Could not verify engine state:", error);
  }

  console.log("UniswapV3AdapterV2 connected to engine");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
=======
import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const adapterAddress = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

  if (!adapterAddress || !engineAddress) {
    throw new Error("UNISWAP_ADAPTER_V2_ADDRESS or ARBITRAGE_ENGINE_V2_ADDRESS missing");
  }

  // Validate addresses from env
  if (!ethers.isAddress(adapterAddress)) {
    throw new Error("Invalid UNISWAP_ADAPTER_V2_ADDRESS");
  }

  if (!ethers.isAddress(engineAddress)) {
    throw new Error("Invalid ARBITRAGE_ENGINE_V2_ADDRESS");
  }

  // Show network and signer info
  const networkName = ((hre.network as any).name ?? "unknown") as string;
  const chainId = ((hre.network as any).config?.chainId ?? "unknown") as string;
  console.log("Network:", networkName, "chainId:", chainId);
  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const adapter: any = await ethers.getContractAt("UniswapV3AdapterV2", adapterAddress);

  console.log("Setting UniswapV3AdapterV2 engine to:", engineAddress);

  const adapterWithSigner: any = adapter.connect(deployer);
  const tx = await adapterWithSigner.setEngine(engineAddress);
  console.log("TX:", tx.hash);

  await tx.wait();

  // Verify contract state after transaction
  const currentEngine = await adapter.engine();

  if (currentEngine.toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("Engine verification failed");
  }

  console.log("Verified engine:", currentEngine);

  console.log("UniswapV3AdapterV2 connected to engine");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995
