import { network } from "hardhat";
import "dotenv/config";


async function main() {

  const connection =
    await network.create("baseSepolia");

  const { ethers } =
    connection;


  const engine =
    await ethers.getContractAt(
      "ArbitrageEngine",
      process.env.ARBITRAGE_ENGINE_ADDRESS!
    );


  const WETH =
    "0x4200000000000000000000000000000000000006";


  const USDC =
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e";


  const amount =
    ethers.parseEther("0.1");



  /*
      Strategy data:

      WETH
        |
        v
      USDC

  */

  const data =
    ethers.AbiCoder.defaultAbiCoder()
    .encode(
      [
        "address",
        "address",
        "uint24",
        "uint256"
      ],
      [
        WETH,
        USDC,
        500,
        0
      ]
    );



  console.log(
    "Executing arbitrage engine..."
  );


  console.log(
    "Token:",
    WETH
  );


  console.log(
    "Amount:",
    amount.toString()
  );



  const tx =
    await engine.executeArbitrage(
      WETH,
      amount,
      data
    );


  const receipt =
    await tx.wait();



  console.log(
    "Success:"
  );


  console.log(
    receipt?.hash
  );

}


main()
.catch(console.error);