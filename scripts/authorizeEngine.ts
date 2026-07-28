import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const morphoFlashLoanAddress =
    process.env.MORPHO_FLASHLOAN_ADDRESS;

  const engineAddress =
    process.env.ARBITRAGE_ENGINE_ADDRESS;


  if (!morphoFlashLoanAddress) {
    throw new Error(
      "MORPHO_FLASHLOAN_ADDRESS belum ada"
    );
  }

  if (!engineAddress) {
    throw new Error(
      "ARBITRAGE_ENGINE_ADDRESS belum ada"
    );
  }


  const morphoFlashLoan =
    await ethers.getContractAt(
      "MorphoFlashLoan",
      morphoFlashLoanAddress
    );


  console.log(
    "Authorizing:",
    engineAddress
  );


  const tx =
    await morphoFlashLoan.setAuthorizedCaller(
      engineAddress,
      true
    );


  await tx.wait();


  console.log(
    "Authorization success"
  );
}


main().catch(console.error);