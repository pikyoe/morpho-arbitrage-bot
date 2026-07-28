import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const [deployer] =
        await ethers.getSigners();


    const morpho =
    process.env.MORPHO_ADDRESS;


     if(!morpho)
     throw new Error(
        "MORPHO_ADDRESS missing"
     );


      console.log(
      "Morpho Blue:",
       morpho
        );

    const Factory =
        await ethers.getContractFactory(
            "MorphoFlashLoanV2"
        );


    const contract =
        await Factory.deploy(
            deployer.address,
            morpho
        );


    await contract.waitForDeployment();


    console.log(
        "MorphoFlashLoanV2:"
    );


    console.log(
        await contract.getAddress()
    );

}


main()
.catch(console.error);