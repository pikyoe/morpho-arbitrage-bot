import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const [signer] =
        await ethers.getSigners();


    const morpho =
        await ethers.getContractAt(
            "MorphoFlashLoan",
            process.env.MORPHO_FLASHLOAN_ADDRESS!
        );


    const engine =
        process.env.ARBITRAGE_ENGINE_ADDRESS!;


    console.log(
        "Setting engine:",
        engine
    );


    const tx =
        await morpho.setEngine(
            engine
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "Engine connected"
    );
}


main()
.catch(console.error);