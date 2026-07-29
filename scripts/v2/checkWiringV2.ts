import { network } from "hardhat";
import "dotenv/config";


async function main() {
    const connection = await network.create("baseSepolia");
    const { ethers } = connection;

    const engine = await ethers.getContractAt(
        "ArbitrageEngineV2",
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
    );

    const morpho = await ethers.getContractAt(
        "MorphoFlashLoanV2",
        process.env.MORPHO_FLASHLOAN_V2_ADDRESS!
    );

    const uniswapAdapterAddress = process.env.UNISWAP_ADAPTER_V2_ADDRESS;
    const aerodromeAdapterAddress = process.env.AERODROME_ADAPTER_V2_ADDRESS;

    const sampleAuthorizedAddress = process.env.SAMPLE_AUTHORIZED_ADDRESS;

    console.log("====================");
    console.log("ENGINE");
    console.log("====================");

    const engineOwner = await engine.owner();
    const profitReceiver = await engine.profitReceiver();
    const engineMorpho = await engine.morphoFlashLoan();

    console.log("Engine owner:", engineOwner);
    console.log("Engine profitReceiver:", profitReceiver);
    console.log("Engine morphoFlashLoan:", engineMorpho);

    if (uniswapAdapterAddress) {
        console.log("Engine Uniswap adapter:", uniswapAdapterAddress);
    }
    if (aerodromeAdapterAddress) {
        console.log("Engine Aerodrome adapter:", aerodromeAdapterAddress);
    }

    console.log("====================");
    console.log("MORPHO FLASHLOAN");
    console.log("====================");

    console.log("Morpho engine:", await morpho.engine());

    if (uniswapAdapterAddress && ethers.isAddress(uniswapAdapterAddress)) {
        const uniswapAdapter = await ethers.getContractAt(
            "UniswapV3AdapterV2",
            uniswapAdapterAddress
        );
        console.log("Uniswap adapter engine:", await uniswapAdapter.engine());
    }

    if (aerodromeAdapterAddress && ethers.isAddress(aerodromeAdapterAddress)) {
        const aerodromeAdapter = await ethers.getContractAt(
            "AerodromeAdapterV2",
            aerodromeAdapterAddress
        );
        console.log("Aerodrome adapter engine:", await aerodromeAdapter.engine());
    }

    console.log("====================");
    console.log("AUTHORIZATION");
    console.log("====================");
    const signer = await ethers.getSigner();
    const signerAddress = await signer.getAddress();
    console.log("Engine owner equals deployer?", engineOwner.toLowerCase() === signerAddress.toLowerCase());
    console.log("Engine profitReceiver equals owner?", profitReceiver.toLowerCase() === engineOwner.toLowerCase());

    if (sampleAuthorizedAddress) {
        console.log(
            "AuthorizedCaller[",
            sampleAuthorizedAddress,
            "]:",
            await engine.authorizedCaller(sampleAuthorizedAddress)
        );
    } else {
        const signer = await ethers.getSigner();
        const signerAddress = await signer.getAddress();
        console.log("AuthorizedCaller[signer]:", await engine.authorizedCaller(signerAddress));
    }
}

main().catch(console.error);