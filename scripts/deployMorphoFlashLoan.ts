import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

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