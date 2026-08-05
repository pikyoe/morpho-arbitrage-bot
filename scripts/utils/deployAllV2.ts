import "dotenv/config";

import getConnection from "../utils/getConnection.js";

import {
    DeploymentFile,
    emptyDeployment
} from "../utils/deployment.js";

import saveDeployment from "../utils/saveDeployment.js";

import * as logger from "../utils/logger.js";

async function main() {
    const {
        ethers,
        signer,
        deployer,
        chainId,
        networkName
    } = await getConnection();

    logger.section("DEPLOY ALL V2");
    logger.info("Network", networkName);
    logger.info("ChainId", chainId.toString());
    logger.info("Deployer", deployer);

    const MORPHO = process.env.MORPHO_ADDRESS;
    const UNISWAP_ROUTER = process.env.UNISWAP_ROUTER_ADDRESS;
    const AERODROME_ROUTER = process.env.AERODROME_ROUTER;

    if (!MORPHO) {
        throw new Error("MORPHO_ADDRESS missing");
    }

    if (!UNISWAP_ROUTER) {
        throw new Error("UNISWAP_ROUTER_ADDRESS missing");
    }

    if (!AERODROME_ROUTER) {
        throw new Error("AERODROME_ROUTER missing");
    }

    logger.section("NETWORK CONFIG");
    logger.address("Morpho", MORPHO);
    logger.address("Uniswap Router", UNISWAP_ROUTER);
    logger.address("Aerodrome Router", AERODROME_ROUTER);

    const deployment: DeploymentFile = emptyDeployment();
    deployment.metadata.network = networkName;
    deployment.metadata.chainId = Number(chainId);
    deployment.metadata.deployer = deployer;
    deployment.metadata.version = "2.0.0";
    deployment.metadata.deployedAt = new Date().toISOString();

    logger.section("DEPLOY MORPHO FLASHLOAN");
    const morphoFlashLoan = await ethers.deployContract("MorphoFlashLoanV2", [deployer, MORPHO]);
    await morphoFlashLoan.waitForDeployment();

    const morphoFlashLoanAddress = await morphoFlashLoan.getAddress();
    logger.address("MorphoFlashLoanV2", morphoFlashLoanAddress);

    logger.section("DEPLOY ARBITRAGE ENGINE");

    const deployerAddress = await signer.getAddress();
    const pendingNonce = await ethers.provider.getTransactionCount(deployerAddress, "pending");

    const expectedEngineAddress = ethers.getCreateAddress({
        from: deployerAddress,
        nonce: pendingNonce + 2
    });

    logger.info("Expected engine address", expectedEngineAddress);

    logger.section("DEPLOY UNISWAP ADAPTER");
    const uniswapAdapter = await ethers.deployContract("UniswapV3AdapterV2", [
        deployer,
        UNISWAP_ROUTER,
        expectedEngineAddress
    ]);
    await uniswapAdapter.waitForDeployment();

    const uniswapAdapterAddress = await uniswapAdapter.getAddress();
    logger.address("UniswapV3AdapterV2", uniswapAdapterAddress);

    logger.section("DEPLOY AERODROME ADAPTER");
    const aerodromeAdapter = await ethers.deployContract("AerodromeAdapterV2", [
        deployer,
        AERODROME_ROUTER,
        expectedEngineAddress
    ]);
    await aerodromeAdapter.waitForDeployment();

    const aerodromeAdapterAddress = await aerodromeAdapter.getAddress();
    logger.address("AerodromeAdapterV2", aerodromeAdapterAddress);

    const engine = await ethers.deployContract("ArbitrageEngineV2", [
        deployer,
        morphoFlashLoanAddress,
        deployer,
        uniswapAdapterAddress,
        aerodromeAdapterAddress
    ]);
    await engine.waitForDeployment();

    const engineAddress = await engine.getAddress();
    logger.address("ArbitrageEngineV2", engineAddress);

    if (engineAddress.toLowerCase() !== expectedEngineAddress.toLowerCase()) {
        throw new Error("Engine address mismatch");
    }

    logger.section("WIRING CONTRACTS");
    logger.info("MorphoFlashLoan.setEngine", engineAddress);
    let tx = await morphoFlashLoan.setEngine(engineAddress);
    await tx.wait();
    logger.success("MorphoFlashLoan wired");

    deployment.contracts.morphoFlashLoan = morphoFlashLoanAddress;
    deployment.contracts.arbitrageEngine = engineAddress;
    deployment.contracts.uniswapAdapter = uniswapAdapterAddress;
    deployment.contracts.aerodromeAdapter = aerodromeAdapterAddress;

    logger.section("SAVE DEPLOYMENT");
    saveDeployment(deployment, {
        network: networkName,
        overwrite: true
    });

    logger.section("VERIFY DEPLOYMENT");
    const morphoEngine = await morphoFlashLoan.engine();
    const uniEngine = await uniswapAdapter.engine();
    const aeroEngine = await aerodromeAdapter.engine();
    const engineMorpho = await engine.morphoFlashLoan();

    logger.info("Morpho -> Engine", morphoEngine);
    logger.info("Uniswap -> Engine", uniEngine);
    logger.info("Aerodrome -> Engine", aeroEngine);
    logger.info("Engine -> Morpho", engineMorpho);

    if (morphoEngine.toLowerCase() !== engineAddress.toLowerCase()) {
        throw new Error("Morpho wiring failed");
    }

    if (uniEngine.toLowerCase() !== engineAddress.toLowerCase()) {
        throw new Error("Uniswap wiring failed");
    }

    if (aeroEngine.toLowerCase() !== engineAddress.toLowerCase()) {
        throw new Error("Aerodrome wiring failed");
    }

    if (engineMorpho.toLowerCase() !== morphoFlashLoanAddress.toLowerCase()) {
        throw new Error("Engine Morpho address mismatch");
    }

    logger.success("Deployment verified successfully");

    logger.section("DEPLOYMENT SUMMARY");
    logger.address("MorphoFlashLoanV2", morphoFlashLoanAddress);
    logger.address("ArbitrageEngineV2", engineAddress);
    logger.address("UniswapV3AdapterV2", uniswapAdapterAddress);
    logger.address("AerodromeAdapterV2", aerodromeAdapterAddress);
    logger.finished();
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

