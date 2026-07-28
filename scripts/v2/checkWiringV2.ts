import { network } from "hardhat";
import "dotenv/config";


async function main(){

    const connection =
        await network.create("baseSepolia");

    const { ethers } =
        connection;


    const engine =
        await ethers.getContractAt(
            "ArbitrageEngineV2",
            process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
        );


    const morpho =
        await ethers.getContractAt(
            "MorphoFlashLoanV2",
            process.env.MORPHO_FLASHLOAN_V2_ADDRESS!
        );


    console.log("====================");
    console.log("ENGINE");
    console.log("====================");


    console.log(
        "Engine morpho:",
        await engine.morphoFlashLoan()
    );


    console.log("====================");
    console.log("MORPHO FLASHLOAN");
    console.log("====================");


    console.log(
        "Morpho engine:",
        await morpho.engine()
    );

    console.log(
        "Authorized:",
        await engine.authorizedCaller(
      "0xBe03B8F812Fb548F692ab20b4c60D009b0238b2A"
     )
     );


}


main()
.catch(console.error);