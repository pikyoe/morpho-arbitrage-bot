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
  console.log("engine:", engine.target || await engine.getAddress());
  console.log("morphoFlashLoan:", morpho.target || await morpho.getAddress());
  console.log("caller:", await signer.getAddress());
  console.log("authorized:", await engine.authorizedCaller(await signer.getAddress()));
  console.log("engine morphoFlashLoan:", await engine.morphoFlashLoan());
  console.log("morpho engine:", await morpho.engine());
  console.log("morpho wrapper morpho:", await morpho.morpho());
  const morphoCode = await ethers.provider.getCode(await morpho.morpho());
  console.log("morpho wrapper morpho code length:", morphoCode.length, morphoCode === '0x' ? 'no code' : 'has code');
  console.log("flashLoanToken:", await engine.flashLoanToken());
  console.log("flashLoanAmount:", (await engine.flashLoanAmount()).toString());

  const adapterContract = await ethers.getContractAt(
    "UniswapV3AdapterV2",
    adapter
  );
  console.log("adapter:", adapter);
  console.log("adapter engine:", await adapterContract.engine());

  try {
    const ok = await engine.validateRoute(route, WETH);
    console.log("validateRoute ok", ok);
  } catch (error) {
    console.error("validateRoute revert:", error);
  }

  const payload = engine.interface.encodeFunctionData("executeArbitrage", [WETH, amount, route]);
  const callTx = {
    to: engine.target || await engine.getAddress(),
    from: await signer.getAddress(),
    data: payload,
  };
  console.log("callTx:", callTx);

  try {
    const result = await ethers.provider.call(callTx);
    console.log("call result:", result);
  } catch (error) {
    console.error("provider.call revert:", error);
    console.error("error keys:", Object.getOwnPropertyNames(error));
    console.error("error JSON:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    if ((error as any).data) {
      console.error("data:", (error as any).data);
      try {
        const decoded = engine.interface.parseError((error as any).data);
        console.log("decoded error:", decoded);
      } catch (parseError) {
        console.error("decode failed:", parseError);
      }
    }
  }

  try {
    const rawResult = await (connection as any).provider.send("eth_call", [callTx, "latest"]);
    console.log("provider.send eth_call result:", rawResult);
  } catch (error) {
    console.error("provider.send eth_call revert:", error);
    console.error("provider.send error keys:", Object.getOwnPropertyNames(error));
    console.error("provider.send error JSON:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});