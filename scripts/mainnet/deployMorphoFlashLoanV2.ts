import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";
async function main() {
    const connection: any = await hre.network.connect();
    const { ethers } = connection;

    loadEnvForNetwork(hre);
    ensureChain(84532n, connection);

    const signer = await ethers.provider.getSigner();
    const deployerAddress = await signer.getAddress();

    const hreNetwork: any = (hre as any).network;
    console.log("Network:", hreNetwork?.name ?? "unknown", "chainId:", hreNetwork?.config?.chainId ?? "unknown");
    console.log("Deployer:", deployerAddress);

    const morphoAddress = process.env.MORPHO_ADDRESS;
    if (!morphoAddress) {
        throw new Error("MORPHO_ADDRESS missing");
    }
    if (!ethers.isAddress(morphoAddress)) {
        throw new Error("Invalid MORPHO_ADDRESS");
    }

    const contract = await ethers.deployContract("MorphoFlashLoanV2", [
        deployerAddress,
        morphoAddress
    ]);

    await contract.waitForDeployment();

    console.log(
        "MorphoFlashLoanV2:",
        await contract.getAddress()
    );
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});