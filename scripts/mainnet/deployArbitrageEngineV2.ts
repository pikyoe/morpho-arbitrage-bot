import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  loadEnvForNetwork(hre);
  ensureChain(8453n);

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

  console.log("Deploying ArbitrageEngineV2...");
  console.log("Owner:", deployer.address);
  console.log("MorphoFlashLoanV2:", morphoFlashLoan);

  const Factory = await ethers.getContractFactory("ArbitrageEngineV2");
  const engine = await Factory.deploy(morphoFlashLoan, deployer.address);

  await engine.waitForDeployment();

  console.log("==============================");
  console.log("ArbitrageEngineV2:", await engine.getAddress());
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
