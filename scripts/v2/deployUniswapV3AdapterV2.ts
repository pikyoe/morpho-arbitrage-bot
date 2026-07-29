import { network } from "hardhat";
import "dotenv/config";
import { ensureChain } from "../utils/validateNetwork.js";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;

    ensureChain(84532n, ethers);


    const [deployer] =
        await ethers.getSigners();

    console.log("Network : baseSepolia");
    console.log("Signer  :", deployer.address);


    const router =
        process.env.UNISWAP_ROUTER_ADDRESS;


    if(!router) {
        throw new Error(
            "UNISWAP_ROUTER_ADDRESS missing"
        );
    }


    console.log("==============================");
    console.log("Deploying UniswapV3AdapterV2");
    console.log("==============================");


    console.log(
        "Owner:",
        deployer.address
    );


    console.log(
        "Router:",
        router
    );



    const Factory =
        await ethers.getContractFactory(
            "UniswapV3AdapterV2"
        );


    const adapter =
        await Factory.deploy(
            deployer.address,
            router
        );


    await adapter.waitForDeployment();


    const address =
        await adapter.getAddress();


    console.log(
        "UniswapV3AdapterV2:"
    );


    console.log(
        address
    );

}


main()
.catch(console.error);