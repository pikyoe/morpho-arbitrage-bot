import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


    const [signer] =
        await ethers.getSigners();


    const engine =
        await ethers.getContractAt(
            "ArbitrageEngine",
            process.env.ARBITRAGE_ENGINE_ADDRESS!
        );


    const caller =
        await signer.getAddress();


    console.log("==========================");
    console.log("Authorizing caller");
    console.log("==========================");

    console.log("Engine :", await engine.getAddress());
    console.log("Caller :", caller);


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