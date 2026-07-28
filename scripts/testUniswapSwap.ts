import { network } from "hardhat";
import "dotenv/config";


async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


    const [signer] =
        await ethers.getSigners();


    const engine =
        await ethers.getContractAt(
            "ArbitrageEngine",
            process.env.ARBITRAGE_ENGINE_ADDRESS!
        );


    console.log(
        "Engine:",
        await engine.getAddress()
    );


    const WETH =
        "0x4200000000000000000000000000000000000006";


    const USDC =
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e";


    const amount =
        ethers.parseEther("0.1");


    const fee = 3000;


    const amountOutMinimum =
        0;


    const data =
        ethers.AbiCoder.defaultAbiCoder()
        .encode(
            [
                "address",
                "address",
                "uint24",
                "uint256"
            ],
            [
                WETH,
                USDC,
                fee,
                amountOutMinimum
            ]
        );


    console.log("==========================");
    console.log("Executing swap test");
    console.log("==========================");

    console.log("Token In :", WETH);
    console.log("Token Out:", USDC);
    console.log("Amount   :", amount.toString());
    console.log(
    "Authorized caller:",
    await engine.authorizedCaller(
        await signer.getAddress()
    )
);

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
        "Swap completed"
    );
}


main()
.catch(console.error);