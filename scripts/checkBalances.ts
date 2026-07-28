import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


    const engine =
        process.env.ARBITRAGE_ENGINE_ADDRESS!;


    const weth =
        await ethers.getContractAt(
            "IERC20",
            "0x4200000000000000000000000000000000000006"
        );


    const usdc =
        await ethers.getContractAt(
            "IERC20",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
        );


    console.log(
        "Engine:",
        engine
    );


    console.log(
        "WETH:",
        ethers.formatEther(
            await weth.balanceOf(engine)
        )
    );


    console.log(
        "USDC:",
        ethers.formatUnits(
            await usdc.balanceOf(engine),
            6
        )
    );
}


main().catch(console.error);