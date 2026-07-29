import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";


async function main(){
    const connection: any = await hre.network.connect();
    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const [signer] = await ethers.getSigners();
    // @ts-ignore: hardhat runtime network typing mismatch
    const hreNetwork: any = (hre as any).network;
    // @ts-ignore: hardhat runtime network typing mismatch
    const networkName = hreNetwork?.name ?? "unknown";
    // @ts-ignore: hardhat runtime network typing mismatch
    const chainId = hreNetwork?.config?.chainId ?? "unknown";
    console.log("Network:", networkName, "chainId:", chainId);
    console.log("Signer:", signer.address);


    const morphoFlashAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;
    if (!morphoFlashAddress) {
        throw new Error("MORPHO_FLASHLOAN_V2_ADDRESS missing");
    }
    if (!ethers.isAddress(morphoFlashAddress)) {
        throw new Error("Invalid MORPHO_FLASHLOAN_V2_ADDRESS");
    }

    const flashToken = process.env.FLASHLOAN_TOKEN ?? "0x4200000000000000000000000000000000000006";
    if (!ethers.isAddress(flashToken)) {
        throw new Error("Invalid FLASHLOAN_TOKEN");
    }

    const morphoFlash =
        await ethers.getContractAt(
            "contracts/v2/interfaces/IMorphoFlashLoan.sol:IMorphoFlashLoan",
            morphoFlashAddress
        );


    const amount =
        ethers.parseEther("0.1");


    console.log(
        "MorphoFlashLoanV2:",
        await morphoFlash.getAddress()
    );


    console.log(
        "Requesting flashloan...",
        {
            token: flashToken,
            amount: amount.toString(),
        }
    );


    await morphoFlash.requestFlashLoan(
        flashToken,
        amount,
        "0x"
    );


    console.log(
        "Success"
    );

}


main()
.catch((error) => {
    console.error(error);
    process.exitCode = 1;
});