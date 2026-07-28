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


    const tx =
        await morpho.setEngine(
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "Engine updated"
    );

}


main()
.catch(console.error);