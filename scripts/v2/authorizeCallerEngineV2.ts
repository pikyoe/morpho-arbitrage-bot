import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const engine =
        await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
        );


    const [signer] =
        await ethers.getSigners();


    const caller =
        signer.address;


    console.log("====================");
    console.log("Authorize Engine Caller");
    console.log("====================");


    console.log(
        "Engine:",
        await engine.getAddress()
    );


    console.log(
        "Caller:",
        caller
    );


    const tx =
        await engine.setAuthorizedCaller(
            caller,
            true
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "Authorization success"
    );

}


main()
.catch(console.error);