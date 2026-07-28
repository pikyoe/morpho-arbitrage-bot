import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const executorAddress = process.env.EXECUTOR_ADDRESS;

  if (!executorAddress) {
    throw new Error("EXECUTOR_ADDRESS belum diisi di .env");
  }

  const executor = await ethers.getContractAt(
    "Executor",
    executorAddress
  );

  const owner = await executor.owner();
  const balance = await executor.getBalance();

  console.log("Executor:", executorAddress);
  console.log("Owner   :", owner);
  console.log("Balance :", balance.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});