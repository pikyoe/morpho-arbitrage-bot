import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


    const morphoFlashLoan =
        await ethers.getContractAt(
            "MorphoFlashLoan",
            process.env.MORPHO_FLASHLOAN_ADDRESS!
        );


    const engine =
        process.env.ARBITRAGE_ENGINE_ADDRESS!;


    console.log("========================");
    console.log("MorphoFlashLoan Auth");
    console.log("========================");

    console.log(
        "MorphoFlashLoan:",
        await morphoFlashLoan.getAddress()
    );

    console.log(
        "Engine:",
        engine
    );


    console.log(
        "Authorized:",
        await morphoFlashLoan.authorizedCaller(engine)
    );
}


main().catch(console.error);