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


    console.log(
        "Morpho:",
        await morpho.morpho()
    );


    console.log(
        "Engine:",
        await morpho.engine()
    );


}


main()
.catch(console.error);