import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);

  const connection: any = await hre.network.connect();
  const { ethers } = connection;

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
  console.log("Network:", networkName, "chainId:", chainId);
  console.log("Signer:", deployer.address);

  const morphoBefore: any = await ethers.getContractAt("MorphoFlashLoanV2", morphoAddress);
  const currentEngineBefore = await morphoBefore.engine();
  console.log("Current engine before:", currentEngineBefore);

  console.log("Setting MorphoFlashLoanV2 engine to:", engineAddress);

  const morphoWithSigner: any = morphoBefore.connect(deployer);
  const tx = await morphoWithSigner.setEngine(engineAddress);
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction Status:", receipt.status === 1 ? "Success" : "Failed");

  if (receipt.status !== 1) {
    throw new Error("Transaction failed");
  }

  // Verify contract state after transaction with a fresh contract instance
  try {
    const morphoAfter: any = await ethers.getContractAt("MorphoFlashLoanV2", morphoAddress);
    const currentEngine = await morphoAfter.engine();

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

  console.log("MorphoFlashLoanV2 connected to engine");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
