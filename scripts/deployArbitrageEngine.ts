import { network } from "hardhat";


async function main() {

    const connection = await network.create("baseSepolia");
    const { ethers } = connection;


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