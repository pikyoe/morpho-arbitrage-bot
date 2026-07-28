import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const adapter =
        await ethers.getContractAt(
            "UniswapV3AdapterV2",
            process.env.UNISWAP_ADAPTER_V2_ADDRESS!
        );


    const engine =
        await adapter.engine();


    console.log("====================");
    console.log("Adapter V2");
    console.log("====================");

    console.log(
        "Adapter:",
        await adapter.getAddress()
    );


    console.log(
        "Engine:",
        engine
    );


}


main()
.catch(console.error);