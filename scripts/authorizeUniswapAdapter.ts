import { network } from "hardhat";
import "dotenv/config";

async function main() {
    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    const adapter = await ethers.getContractAt(
        "UniswapV3Adapter",
        process.env.UNISWAP_ADAPTER_ADDRESS!
    );

    const tx = await adapter.setAuthorizedCaller(
        process.env.ARBITRAGE_ENGINE_ADDRESS!,
        true
    );

    await tx.wait();

    console.log("ArbitrageEngine authorized.");
}

main().catch(console.error);