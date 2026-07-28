import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const [deployer] =
        await ethers.getSigners();


    const morphoFlashLoan =
        process.env.MORPHO_FLASHLOAN_V2_ADDRESS;


    if(!morphoFlashLoan) {
        throw new Error(
            "MORPHO_FLASHLOAN_V2_ADDRESS missing"
        );
    }



    console.log("==============================");
    console.log("Deploying ArbitrageEngineV2");
    console.log("==============================");


    console.log(
        "Owner:",
        deployer.address
    );


    console.log(
        "MorphoFlashLoanV2:",
        morphoFlashLoan
    );



    const Factory =
        await ethers.getContractFactory(
            "ArbitrageEngineV2"
        );


    const engine =
        await Factory.deploy(
            deployer.address,
            morphoFlashLoan
        );


    await engine.waitForDeployment();



    console.log(
        "ArbitrageEngineV2:"
    );


    console.log(
        await engine.getAddress()
    );

}


main()
.catch(console.error);