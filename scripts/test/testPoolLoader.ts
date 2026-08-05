import hre from "hardhat";

import loadEnvForNetwork from "../utils/loadEnv.js";

import { PoolCache } from "../scanner/PoolCache.js";
import { PoolLoader } from "../scanner/PoolLoader.js";

async function main() {

    const connection: any =
        await hre.network.connect();

    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const cache = new PoolCache();

    const loader = new PoolLoader(

        ethers.provider,

        cache

    );
    // @ts-ignore: hardhat hre network name is not typed on this version
    const networkName = (((hre as any)["network"] as any)?.name ?? "unknown") as string;
    console.log("Network :", networkName);
    console.log("Factory :", process.env.UNISWAP_FACTORY_ADDRESS);
    console.log("WETH    :", process.env.WETH_ADDRESS);
    console.log("USDC    :", process.env.USDC_ADDRESS);

    await loader.loadUniswap(

        process.env.UNISWAP_FACTORY_ADDRESS!

    );

    await loader.loadAerodrome(

        process.env.AERODROME_FACTORY_ADDRESS!

    );

    console.log(

        "Pools:",

        cache.size()

    );

    console.table(

        cache.getAll()

    );

}

main().catch(console.error);