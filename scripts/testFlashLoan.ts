import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const flashLoanAddress = process.env.MORPHO_FLASHLOAN_ADDRESS;

  if (!flashLoanAddress) {
    throw new Error("MORPHO_FLASHLOAN_ADDRESS environment variable is not set");
  }

  const contract =
    await ethers.getContractAt(
      "MorphoFlashLoan",
      flashLoanAddress
    );


  const weth =
    "0x4200000000000000000000000000000000000006";


  const amount =
    ethers.parseEther("0.1");


  const data =
    ethers.AbiCoder.defaultAbiCoder()
      .encode(
        ["address"],
        [weth]
      );


  console.log("Requesting flash loan...");
  console.log("Amount:", amount.toString());


  const tx =
    await contract.requestFlashLoan(
      weth,
      amount,
      data
    );


  const receipt =
    await tx.wait();


  console.log(
    "Transaction:",
    receipt?.hash
  );
}

main().catch(console.error);