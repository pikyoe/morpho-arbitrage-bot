import { ethers } from "hardhat";

async function main() {

    const [deployer] =
        await ethers.getSigners();

    const Factory =
        await ethers.getContractFactory(
            "UniswapV3AdapterV2"
        );

    const adapter =
        await Factory.deploy(

            deployer.address,

            process.env.AERODROME_ROUTER!

        );

    await adapter.waitForDeployment();

    console.log(
        "UniswapAdapter:",
        await adapter.getAddress()
    );

}

main().catch(console.error);