import { network } from "hardhat";
import { ensureChain } from "./utils/validateNetwork.js";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  ensureChain(84532n);

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