import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const {ethers}=connection;


    const adapter =
        await ethers.getContractAt(
            "UniswapV3Adapter",
            process.env.UNISWAP_ADAPTER_ADDRESS!
        );


    const engine =
        process.env.ARBITRAGE_ENGINE_ADDRESS!;


    console.log(
        "Authorizing Engine:",
        engine
    );


    const tx =
        await adapter.setAuthorizedCaller(
            engine,
            true
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();


    console.log(
        "Adapter authorized"
    );
}


main()
.catch(console.error);