import { network } from "hardhat";
import { ensureChain } from "./utils/validateNetwork.js";


async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    ensureChain(84532n);


    const [deployer] =
        await ethers.getSigners();


    const morphoFlashLoan =
        process.env.MORPHO_FLASHLOAN_ADDRESS;


    if (!morphoFlashLoan) {
        throw new Error(
            "MORPHO_FLASHLOAN_ADDRESS belum ada"
        );
    }


    console.log(
        "Deploying ArbitrageEngine..."
    );


    const Factory =
        await ethers.getContractFactory(
            "ArbitrageEngine"
        );


    const engine =
        await Factory.deploy(
            deployer.address,
            morphoFlashLoan
        );


    await engine.waitForDeployment();


    console.log(
        "ArbitrageEngine:"
    );

    console.log(
        await engine.getAddress()
    );

}


main().catch(console.error);