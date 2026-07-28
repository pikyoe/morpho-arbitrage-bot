import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


    const adapter =
        await ethers.getContractAt(
            "UniswapV3Adapter",
            process.env.UNISWAP_ADAPTER_ADDRESS!
        );


    const engine =
        process.env.ARBITRAGE_ENGINE_ADDRESS!;


    console.log("Adapter :", await adapter.getAddress());
    console.log("Engine  :", engine);


    const status =
        await adapter.authorizedCaller(engine);


    console.log(
        "Authorized:",
        status
    );
}

main().catch(console.error);