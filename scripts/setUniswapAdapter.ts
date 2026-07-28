import { network } from "hardhat";
import "dotenv/config";

async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    const [signer] = await ethers.getSigners();

    console.log("=================================");
    console.log("Setting Uniswap Adapter");
    console.log("=================================");

    console.log("Signer :", await signer.getAddress());
    console.log("Engine :", process.env.ARBITRAGE_ENGINE_ADDRESS);
    console.log("Adapter:", process.env.UNISWAP_ADAPTER_ADDRESS);

    const engine = await ethers.getContractAt(
        "ArbitrageEngine",
        process.env.ARBITRAGE_ENGINE_ADDRESS!
    );
    
    console.log("Current adapter:", await engine.uniswapAdapter());
    
    const owner = await engine.owner();

    console.log("Owner  :", owner);

    console.log("=================================");

    const tx = await engine.setUniswapAdapter(
        process.env.UNISWAP_ADAPTER_ADDRESS!
    );

    console.log("TX Hash:", tx.hash);

    await tx.wait();

    console.log("=================================");
    console.log("Uniswap Adapter connected!");
    console.log("=================================");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});