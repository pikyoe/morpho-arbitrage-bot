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
