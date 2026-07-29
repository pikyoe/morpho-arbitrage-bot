import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const env = process.env;
  const engineAddress = env.ARBITRAGE_ENGINE_V2_ADDRESS!;
  const adapterAddress = env.UNISWAP_ADAPTER_V2_ADDRESS!;
  const morphoFlashLoanAddress = env.MORPHO_FLASHLOAN_V2_ADDRESS!;
  const morphoAddress = env.MORPHO_ADDRESS!;

  console.log("engine:", engineAddress);
  console.log("adapter:", adapterAddress);
  console.log("morphoFlashLoan:", morphoFlashLoanAddress);
  console.log("morpho:", morphoAddress);

  const addresses = [engineAddress, adapterAddress, morphoFlashLoanAddress, morphoAddress];
  for (const addr of addresses) {
    const code = await ethers.provider.getCode(addr);
    console.log(addr, "code length", code.length, code === "0x" ? "no code" : "has code");
  }

  const engine = await ethers.getContractAt("ArbitrageEngineV2", engineAddress);
  const morphoFlashLoan = await ethers.getContractAt("MorphoFlashLoanV2", morphoFlashLoanAddress);
  const adapter = await ethers.getContractAt("UniswapV3AdapterV2", adapterAddress);

  console.log("engine morphoFlashLoan:", await engine.morphoFlashLoan());
  console.log("engine flashLoanToken:", await engine.flashLoanToken());
  console.log("engine flashLoanAmount:", (await engine.flashLoanAmount()).toString());
  console.log("adapter engine:", await adapter.engine());
  console.log("morphoFlashLoan engine:", await morphoFlashLoan.engine());
  console.log("morphoFlashLoan flashToken:", await morphoFlashLoan.flashToken());

  const flashLoanSelector = ethers.keccak256(ethers.toUtf8Bytes("flashLoan(address,uint256,bytes)")).slice(0, 10);
  const token = env.FLASHLOAN_TOKEN ?? "0x4200000000000000000000000000000000000006";
  const amount = ethers.parseEther("0.1");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bytes"], [token, amount, "0x"]);
  const payload = flashLoanSelector + encoded.slice(2);

  console.log("flashLoan selector:", flashLoanSelector);
  console.log("morpho eth_call payload length:", payload.length);

  try {
    const result = await ethers.provider.call({
      to: morphoAddress,
      data: payload,
    });
    console.log("morpho eth_call result:", result);
  } catch (error) {
    console.error("morpho eth_call revert:", error);
    if ((error as any).data) {
      console.error("morpho data:", (error as any).data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});