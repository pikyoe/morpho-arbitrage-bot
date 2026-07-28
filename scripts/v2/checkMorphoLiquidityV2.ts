import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } = connection;


    const WETH =
        "0x4200000000000000000000000000000000000006";


    const morpho =
        await ethers.getContractAt(
            "IMorpho",
            process.env.MORPHO_ADDRESS!
        );


    console.log(
        "Morpho:",
        await morpho.getAddress()
    );


    console.log(
        "Testing WETH flashloan availability..."
    );


    try {

        await morpho.flashLoan.staticCall(
            WETH,
            ethers.parseEther("0.1"),
            "0x"
        );

        console.log(
            "Flashloan available"
        );

    }
    catch(e:any){

        console.log(
            "Flashloan failed"
        );

        console.log(
            e.data
        );

    }

}


main();