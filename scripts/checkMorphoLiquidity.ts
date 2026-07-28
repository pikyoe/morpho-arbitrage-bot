import { network } from "hardhat";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection;

  const morpho =
    "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

  const tokens = {
    WETH: "0x4200000000000000000000000000000000000006",
  };

  for (const [name, token] of Object.entries(tokens)) {

    const erc20 =
      await ethers.getContractAt(
        "IERC20",
        token
      );

    const balance =
      await erc20.balanceOf(morpho);

    console.log(
      name,
      balance.toString()
    );
  }
}

main().catch(console.error);