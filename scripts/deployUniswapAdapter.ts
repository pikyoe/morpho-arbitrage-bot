import { network } from "hardhat";

async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const [deployer] =
        await ethers.getSigners();


    // Ganti jika router Base Sepolia berbeda
    const router =
        process.env.UNISWAP_ROUTER_ADDRESS!;


    console.log(
        "Deploying UniswapV3Adapter..."
    );

    console.log(
        "Router:",
        router
    );


    const adapter =
        await ethers.deployContract(
            "UniswapV3Adapter",
            [
                await deployer.getAddress(),
                router
            ]
        );


    await adapter.waitForDeployment();


    console.log(
        "UniswapV3Adapter:"
    );

    console.log(
        await adapter.getAddress()
    );
}


main().catch(console.error);