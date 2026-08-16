import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection as any;


    const [signer] =
        await ethers.getSigners();



    const engine =
        await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
        );



    const adapter =
        process.env.UNISWAP_ADAPTER_V2_ADDRESS!;



    const WETH =
        "0x4200000000000000000000000000000000000006";


    const USDC =
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e";



    const amount =
        ethers.parseEther("0.1");



    console.log("======================");
    console.log("V2 ARBITRAGE TEST");
    console.log("======================");


    console.log(
        "Engine:",
        await engine.getAddress()
    );


    console.log(
        "Caller:",
        await signer.getAddress()
    );


    console.log(
        "Authorized:",
        await engine.authorizedCaller(
            await signer.getAddress()
        )
    );



    const route = {
        swaps: [
            {
                adapter,
                tokenIn: WETH,
                tokenOut: USDC,
                fee: 3000,
                amountIn: amount,
                minAmountOut: 1n,
                data: "0x",
                deadline: BigInt(Math.floor(Date.now() / 1000) + 30)
            },
            {
                adapter,
                tokenIn: USDC,
                tokenOut: WETH,
                fee: 3000,
                amountIn: 0n,
                minAmountOut: 1n,
                data: "0x",
                deadline: BigInt(Math.floor(Date.now() / 1000) + 30)
            }
        ],
        profitToken: WETH,
        minProfit: 0n
    };




    console.log(
        "Swap 2:",
        USDC,
        "->",
        WETH
    );


    console.log(
        "Amount:",
        amount.toString()
    );



    console.log("======================");
    console.log("Simulation");
    console.log("======================");



    const tx =
        await engine.executeArbitrage(
            WETH,
            amount,
            route
        );


    console.log(
        "TX:",
        tx.hash
    );


    await tx.wait();



    console.log(
        "Arbitrage completed"
    );

}


main()
.catch(
    console.error
);