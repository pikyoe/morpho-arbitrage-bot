import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const morpho =
        await ethers.getContractAt(
            "MorphoFlashLoanV2",
            process.env.MORPHO_FLASHLOAN_V2_ADDRESS!
        );


    console.log("====================");
    console.log("MORPHO V2");
    console.log("====================");


    console.log(
        "Morpho:",
        await morpho.getAddress()
    );


    console.log(
        "Engine:",
        await morpho.engine()
    );


    console.log(
        "Morpho core:",
        await morpho.morpho()
    );

}

main()
.catch(console.error);