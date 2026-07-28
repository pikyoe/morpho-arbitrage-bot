import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const adapterAddress =
        process.env.UNISWAP_ADAPTER_V2_ADDRESS;

    const engineAddress =
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS;


    if(!adapterAddress || !engineAddress)
        throw new Error("Missing address");



    const adapter =
        await ethers.getContractAt(
            "UniswapV3AdapterV2",
            adapterAddress
        );



    console.log(
        "Setting Engine:"
    );

    console.log(
        engineAddress
    );


    const tx =
        await adapter.setEngine(
            engineAddress
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "Adapter connected"
    );

}


main()
.catch(console.error);