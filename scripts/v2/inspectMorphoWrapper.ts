import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS!;
  const wrapperAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS!;
  const morphoAddress = process.env.MORPHO_ADDRESS!;
  const token = process.env.FLASHLOAN_TOKEN ?? "0x4200000000000000000000000000000000000006";
  const amount = ethers.parseEther("0.1");

  console.log("engineAddress:", engineAddress);
  console.log("wrapperAddress:", wrapperAddress);
  console.log("morphoAddress:", morphoAddress);
  console.log("token:", token);
  console.log("amount:", amount.toString());

  const morphoWrapper = await ethers.getContractAt("MorphoFlashLoanV2", wrapperAddress);
  const morpho = await ethers.getContractAt("MorphoFlashLoanV2", wrapperAddress);

  console.log("wrapper engine:", await morphoWrapper.engine());
  console.log("wrapper morpho:", await morphoWrapper.morpho());
  console.log("wrapper flashToken:", await morphoWrapper.flashToken());

  const requestData = morphoWrapper.interface.encodeFunctionData("requestFlashLoan", [token, amount, "0x"]);
  const callTx = {
    to: wrapperAddress,
    from: engineAddress,
    data: requestData,
  };
  try {
    const result = await ethers.provider.call(callTx);
    console.log("wrapper requestFlashLoan call result:", result);
  } catch (error) {
    console.error("wrapper requestFlashLoan call revert:", error);
    if ((error as any).data) {
      console.error("wrapper revert data:", (error as any).data);
      try {
        console.log("decoded error:", morphoWrapper.interface.parseError((error as any).data));
      } catch (parseError) {
        console.error("decode failed", parseError);
      }
    }
  }

  const morphoIface = new ethers.Interface(["function flashLoan(address,uint256,bytes) external"]);
  const morphoData = morphoIface.encodeFunctionData("flashLoan", [token, amount, "0x"]);
  const morphoCallTx = {
    to: morphoAddress,
    from: wrapperAddress,
    data: morphoData,
  };
  try {
    const morphoResult = await ethers.provider.call(morphoCallTx);
    console.log("morpho flashLoan call result:", morphoResult);
  } catch (error) {
    console.error("morpho flashLoan call revert:", error);
    if ((error as any).data) {
      console.error("morpho revert data:", (error as any).data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});