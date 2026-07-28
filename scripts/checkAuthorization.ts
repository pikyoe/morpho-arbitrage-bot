import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    const [signer] = await ethers.getSigners();

    const engine =
        await ethers.getContractAt(
            "ArbitrageEngine",
            process.env.ARBITRAGE_ENGINE_ADDRESS!
        );

    const caller = await signer.getAddress();

    console.log("Engine :", await engine.getAddress());
    console.log("Caller :", caller);

    const status =
        await engine.authorizedCaller(caller);

    console.log("Authorized:", status);
}

main().catch(console.error);