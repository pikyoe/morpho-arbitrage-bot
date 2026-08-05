import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);

  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
  const morphoAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;

  if (!engineAddress || !morphoAddress) {
    throw new Error("Missing addresses");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const engine = await ethers.getContractAt("ArbitrageEngineV2", engineAddress);

  console.log("Setting Engine MorphoFlashLoan to:", morphoAddress);

  const engineWithSigner = engine.connect(deployer);
  const tx = await engineWithSigner.setMorphoFlashLoan(morphoAddress);
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction Status:", receipt.status === 1 ? "Success" : "Failed");

  if (receipt.status !== 1) {
    throw new Error("Transaction failed");
  }

  const currentMorpho = await engine.morphoFlashLoan();
  console.log("Verified MorphoFlashLoan:", currentMorpho);

  if (currentMorpho.toLowerCase() !== morphoAddress.toLowerCase()) {
    console.warn("⚠️ Verification failed but transaction succeeded");
  } else {
    console.log("✅ Engine MorphoFlashLoan set successfully");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});