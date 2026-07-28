import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const [deployer] = await ethers.getSigners();

  console.log("Deploying Executor V2...");
  console.log("Deployer:", deployer.address);

  const Executor = await ethers.getContractFactory(
    "Executor"
  );

  const executor = await Executor.deploy(
    deployer.address
  );

  await executor.waitForDeployment();

  const address = await executor.getAddress();

  console.log("==============================");
  console.log("Executor V2 deployed:");
  console.log(address);
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});