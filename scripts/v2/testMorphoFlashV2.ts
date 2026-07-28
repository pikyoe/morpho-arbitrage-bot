import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } = connection;


    const morphoFlash =
        await ethers.getContractAt(
            "MorphoFlashLoanV2",
            process.env.MORPHO_FLASHLOAN_V2_ADDRESS!
        );


    const token =
        "0x4200000000000000000000000000000000000006";


    const amount =
        ethers.parseEther("0.1");


    console.log(
        "MorphoFlashLoanV2:",
        await morphoFlash.getAddress()
    );


    console.log(
        "Requesting flashloan..."
    );


    await morphoFlash.requestFlashLoan(
        token,
        amount,
        "0x"
    );


    console.log(
        "Success"
    );

}


main()
.catch(console.error);