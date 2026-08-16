import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;
  const [signer] = await ethers.getSigners();

  const engine = await ethers.getContractAt(
    "ArbitrageEngineV2",
    process.env.ARBITRAGE_ENGINE_V2_ADDRESS!
  );

  const morpho = await ethers.getContractAt(
    "MorphoFlashLoanV2",
    process.env.MORPHO_FLASHLOAN_V2_ADDRESS!
  );

  const WETH = "0x4200000000000000000000000000000000000006";
  const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const adapter = process.env.UNISWAP_ADAPTER_V2_ADDRESS!;
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
        deadline: Math.floor(Date.now() / 1000) + 30,
      },
      {
        adapter,
        tokenIn: USDC,
        tokenOut: WETH,
        fee: 3000,
        amountIn: 0n,
        minAmountOut: 1n,
        data: "0x",
        deadline: Math.floor(Date.now() / 1000) + 30,
      },
    ],
    profitToken: WETH,
    minProfit: 0n,
  };

  console.log("network:", await ethers.provider.getNetwork());
  console.log("engine:", await engine.getAddress());
  console.log("morphoFlashLoan:", await morpho.getAddress());
  console.log("caller:", await signer.getAddress());
  console.log("authorized:", await engine.authorizedCaller(await signer.getAddress()));
  console.log("engine morphoFlashLoan:", await engine.morphoFlashLoan());
  console.log("morpho engine:", await morpho.engine());
  console.log("flashLoanToken:", await engine.flashLoanToken());
  console.log("flashLoanAmount:", (await engine.flashLoanAmount()).toString());

  try {
    const ok = await engine.validateRoute(route, WETH);
    console.log("validateRoute ok", ok);
  } catch (error) {
    console.error("validateRoute revert:", error);
  }

  try {
    const tx = await engine.populateTransaction.executeArbitrage(WETH, amount, route);
    const callTx = {
      to: tx.to,
      data: tx.data,
      from: await signer.getAddress(),
    };
    console.log("callTx:", callTx);
    const result = await ethers.provider.call(callTx);
    console.log("provider.call result:", result);
    console.log("call simulation OK");
  } catch (error) {
    console.error("provider.call revert:", error);
    if ((error as any).data) {
      console.error("data:", (error as any).data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
