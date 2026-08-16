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
    console.log("MorphoFlashLoanV2");
    console.log("====================");


    console.log(
        "Stored engine:",
        await morpho.engine()
    );


    console.log(
        "Expected engine:",
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS
    );

    // Also check engine internal state if set
    try {
        const engineAddr = process.env.ARBITRAGE_ENGINE_V2_ADDRESS!;
        const engine = await ethers.getContractAt("ArbitrageEngineV2", engineAddr);
        console.log("Engine flashLoanToken:", await engine.flashLoanToken());
        console.log("Engine flashLoanAmount:", (await engine.flashLoanAmount()).toString());
    } catch (e) {
        console.warn("Could not inspect engine state:", e);
    }

}


main()
.catch(console.error);