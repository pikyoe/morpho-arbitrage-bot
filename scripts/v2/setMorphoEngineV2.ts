import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const morphoAddress =
        process.env.MORPHO_FLASHLOAN_V2_ADDRESS;

    const engineAddress =
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS;


    if(!morphoAddress || !engineAddress)
        throw new Error("Missing address");



    const morpho =
        await ethers.getContractAt(
            "MorphoFlashLoanV2",
            morphoAddress
        );



    console.log(
        "Setting Engine:"
    );

    console.log(
        engineAddress
    );


    const tx =
        await morpho.setEngine(
            engineAddress
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "MorphoFlashLoanV2 connected"
    );

}


main()
.catch(console.error);