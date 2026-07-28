import { network } from "hardhat";
import "dotenv/config";

async function main() {
    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    const engine = await ethers.getContractAt(
        "ArbitrageEngine",
        process.env.ARBITRAGE_ENGINE_ADDRESS!
    );

    console.log("Owner      :", await engine.owner());
    console.log("FlashLoan  :", await engine.morphoFlashLoan());
    console.log("Adapter    :", await engine.uniswapAdapter());
}

main().catch(console.error);