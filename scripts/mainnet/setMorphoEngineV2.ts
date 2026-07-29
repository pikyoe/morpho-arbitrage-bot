import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const morphoAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;
  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;

  if (!morphoAddress || !engineAddress) {
    throw new Error("MORPHO_FLASHLOAN_V2_ADDRESS or ARBITRAGE_ENGINE_V2_ADDRESS missing");
  }

  // Validate addresses from env
  if (!ethers.isAddress(morphoAddress)) {
    throw new Error("Invalid MORPHO_FLASHLOAN_V2_ADDRESS");
  }

  if (!ethers.isAddress(engineAddress)) {
    throw new Error("Invalid ARBITRAGE_ENGINE_V2_ADDRESS");
  }

  // Log network and signer info
    const networkName = ((hre.network as any).name ?? "unknown") as string;
    const chainId = ((hre.network as any).config?.chainId ?? "unknown") as string;
  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const morpho: any = await ethers.getContractAt("MorphoFlashLoanV2", morphoAddress);

  console.log("Setting MorphoFlashLoanV2 engine to:", engineAddress);

  // Use explicit signer for the transaction
  const morphoWithSigner: any = morpho.connect(deployer);
  const tx = await morphoWithSigner.setEngine(engineAddress);
  console.log("TX:", tx.hash);

  await tx.wait();

  // Verify contract state after transaction
  const currentEngine = await morpho.engine();

  if (currentEngine.toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("Engine verification failed");
  }

  console.log("Verified engine:", currentEngine);
  console.log("MorphoFlashLoanV2 connected to engine");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
