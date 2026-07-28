import hre from "hardhat";

async function main() {
    const { ethers } = await hre.network.connect();

    const signer = await ethers.provider.getSigner();

    console.log(
        "Deployer:",
        await signer.getAddress()
    );

    const contract =
        await ethers.deployContract(
            "MorphoFlashLoanV2",
            [
                await signer.getAddress(),
                process.env.MORPHO_ADDRESS!
            ]
        );

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