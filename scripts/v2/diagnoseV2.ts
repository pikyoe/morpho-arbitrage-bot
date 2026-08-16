import { network } from "hardhat";
import "dotenv/config";

declare const process: {
    env: Record<string, string | undefined>;
};

async function main() {
    const connection = await network.create("baseSepolia");
    const { ethers } = connection as any;

    const [signer] = await ethers.getSigners();

    const engine = await ethers.getContractAt(
        "ArbitrageEngineV2",
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
    );

    const adapter = process.env.UNISWAP_ADAPTER_V2_ADDRESS!;

    const WETH = "0x4200000000000000000000000000000000000006";
    const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

    const amount = ethers.parseEther("0.1");

    const route = {
        swaps: [
            {
                adapter,
                tokenIn: WETH,
                tokenOut: USDC,
                fee: 3000,
                amountIn: amount,
                minAmountOut: 1n,
                data: "0x",
                deadline: BigInt(Math.floor(Date.now() / 1000) + 30)
            },
            {
                adapter,
                tokenIn: USDC,
                tokenOut: WETH,
                fee: 3000,
                amountIn: 0n,
                minAmountOut: 1n,
                data: "0x",
                deadline: BigInt(Math.floor(Date.now() / 1000) + 30)
            }
        ],
        profitToken: WETH,
        minProfit: 0n
    };

    console.log("======================");
    console.log("CONFIG");
    console.log("======================");

    console.log("Signer :", await signer.getAddress());
    console.log("Engine :", await engine.getAddress());
    console.log("Morpho :", await engine.morphoFlashLoan());
    console.log("Adapter:", adapter);
    console.log("WETH   :", WETH);
    console.log("USDC   :", USDC);

    console.log("======================");
    console.log("AUTHORIZATION");
    console.log("======================");

    const owner = await engine.owner();
    const signerAddress = await signer.getAddress();

    const authorized =
        signerAddress.toLowerCase() === owner.toLowerCase() ||
        await engine.authorizedCaller(signerAddress);

    console.log("Authorized:", authorized);

    if (!authorized) {
        throw new Error("Signer not authorized");
    }

    console.log("======================");
    console.log("ADAPTER WIRING");
    console.log("======================");

    const adapterContract = await ethers.getContractAt("UniswapV3AdapterV2", adapter);
    const adapterEngine = await adapterContract.engine();

    console.log("Adapter engine:", adapterEngine);

    if (adapterEngine.toLowerCase() !== (await engine.getAddress()).toLowerCase()) {
        throw new Error("Adapter is not wired to the engine");
    }

    console.log("======================");
    console.log("ROUTE VALIDATION");
    console.log("======================");

    const valid = await engine.validateRoute(route, WETH);
    console.log("Route valid:", valid);

    if (!valid) {
        throw new Error("Route validation failed");
    }

    console.log("======================");
    console.log("ENGINE BALANCE");
    console.log("======================");

    const weth = await ethers.getContractAt(
        "IErc20Minimal",
        WETH
    );

    console.log("Engine WETH:", await weth.balanceOf(await engine.getAddress()));

    console.log("======================");
    console.log("EXECUTE ARBITRAGE");
    console.log("======================");

    const tx = await engine.executeArbitrage(WETH, amount, route);
    console.log("TX:", tx.hash);

    await tx.wait();
    console.log("Arbitrage completed");
}

main().catch(console.error);
