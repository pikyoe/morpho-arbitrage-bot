import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const engine =
        await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
        );


    console.log("====================");
    console.log("ENGINE LINKS");
    console.log("====================");


    console.log(
        "Engine:",
        await engine.getAddress()
    );


    console.log(
        "MorphoFlashLoan:",
        await engine.morphoFlashLoan()
    );


    console.log(
        "Adapter:",
        await engine.adapter()
    );



    const adapter =
        await ethers.getContractAt(
            "UniswapV3AdapterV2",
            process.env.UNISWAP_ADAPTER_V2_ADDRESS!
        );


    console.log("====================");
    console.log("ADAPTER");
    console.log("====================");


    console.log(
        "Adapter:",
        await adapter.getAddress()
    );


    console.log(
        "Adapter Engine:",
        await adapter.engine()
    );


}


main()
.catch(console.error);