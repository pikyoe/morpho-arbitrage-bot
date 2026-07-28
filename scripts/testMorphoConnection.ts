import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const morphoFlashLoan =
    await ethers.getContractAt(
      "MorphoFlashLoan",
      "0xa9C630Ff89491ba6E495cFec34A5c7C766aC1d6b"
    );

  const morpho =
    await morphoFlashLoan.morpho();

  console.log(
    "Morpho address:",
    morpho
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});