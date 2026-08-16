import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";


async function main(){
    const { ethers } = await hre.network.connect();

    loadEnvForNetwork(hre);

    const [signer] = await ethers.getSigners();
    const networkName = (hre.network as any).name ?? "unknown";
    const chainId = (hre.network as any).config?.chainId ?? "unknown";
    console.log("Network:", networkName, "chainId:", chainId);
    console.log("Signer:", signer.address);

    const morphoAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS;
    if (!morphoAddress) {
        throw new Error("MORPHO_FLASHLOAN_V2_ADDRESS missing");
    }
    if (!ethers.isAddress(morphoAddress)) {
        throw new Error("Invalid MORPHO_FLASHLOAN_V2_ADDRESS");
    }

    const morpho =
        await ethers.getContractAt(
            "MorphoFlashLoanV2",
            morphoAddress
        );


    console.log(
        "Morpho:",
        await morpho.morpho()
    );


    console.log(
        "Engine:",
        await morpho.engine()
    );


}


main()
.catch((error) => {
    console.error(error);
    process.exitCode = 1;
});