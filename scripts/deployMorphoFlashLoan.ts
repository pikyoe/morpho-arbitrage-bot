import { network } from "hardhat";
import { ensureChain } from "./utils/validateNetwork.js";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  ensureChain(84532n);

  const [deployer] = await ethers.getSigners();

  const morphoAddress = process.env.MORPHO_ADDRESS;

  if (!morphoAddress) {
    throw new Error("MORPHO_ADDRESS belum ada di .env");
  }

  console.log("Deploying MorphoFlashLoan...");
  console.log("Owner :", deployer.address);
  console.log("Morpho:", morphoAddress);

  const Contract =
    await ethers.getContractFactory("MorphoFlashLoan");

  const contract =
    await Contract.deploy(
      deployer.address,
      morphoAddress
    );

  await contract.waitForDeployment();

  console.log("==============================");
  console.log(
    "MorphoFlashLoan:",
    await contract.getAddress()
  );
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});