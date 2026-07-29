import { network } from "hardhat";
import { ensureChain } from "./utils/validateNetwork.js";

async function main() {
  const connection = await network.connect();
  const { ethers } = connection;

  ensureChain(84532n);

  console.log("Deploying Executor...");

  const [deployer] = await ethers.getSigners();

  console.log("Deployer :", deployer.address);
  console.log("Balance  :", (await ethers.provider.getBalance(deployer.address)).toString());

  const Executor = await ethers.getContractFactory("Executor");

  const executor = await Executor.deploy(deployer.address);

  await executor.waitForDeployment();

  console.log("=================================");
  console.log("Executor deployed successfully!");
  console.log("Address :", await executor.getAddress());
  console.log("=================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});