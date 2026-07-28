import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


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



    const route =
    {
        swaps:
        [
            {
                adapter,

                tokenIn:
                    WETH,

                tokenOut:
                    USDC,

                amountIn:
                    amount,

                minAmountOut:
                    0,

                data:
                    "0x"
            },


            {
                adapter,

                tokenIn:
                    USDC,

                tokenOut:
                    WETH,

                amountIn:
                    0,

                minAmountOut:
                    0,

                data:
                    "0x"
            }
        ],


        profitToken:
            WETH,


        minProfit:
            0
    };



    const abi =
        ethers.AbiCoder.defaultAbiCoder();



    const data =
        abi.encode(
        [
            "tuple(tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[] swaps,address profitToken,uint256 minProfit)"
        ],
        [
            route
        ]);



    console.log("======================");
    console.log("Route");
    console.log("======================");


    console.log(
        "Swap 1:",
        WETH,
        "->",
        USDC
    );


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


    await engine.executeArbitrage.staticCall(
        WETH,
        amount,
        data
    );


    console.log(
        "Simulation OK"
    );



    console.log("======================");
    console.log("Executing V2 arbitrage...");
    console.log("======================");



    const tx =
        await engine.executeArbitrage(
            WETH,
            amount,
            data
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