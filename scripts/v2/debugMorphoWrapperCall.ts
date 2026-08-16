import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const wrapperAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS!;
  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS!;
  const token = process.env.FLASHLOAN_TOKEN ?? "0x4200000000000000000000000000000000000006";
  const amount = ethers.parseEther("0.1");

  const wrapper = await ethers.getContractAt("MorphoFlashLoanV2", wrapperAddress);
  const requestData = wrapper.interface.encodeFunctionData("requestFlashLoan", [token, amount, "0x"]);
  console.log("wrapper requestData", requestData);

  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256", "bytes"], requestData.slice(10));
  console.log("decoded token", decoded[0]);
  console.log("decoded amount", decoded[1].toString());
  console.log("decoded data", decoded[2]);

  console.log("wrapper function selector", requestData.slice(0, 10));
  console.log("requestFlashLoan selector", wrapper.interface.getSighash("requestFlashLoan"));

  const tx = { to: wrapperAddress, from: engineAddress, data: requestData };
  try {
    const result = await ethers.provider.call(tx);
    console.log("result", result);
  } catch (error) {
    console.error("revert", error);
    if ((error as any).data) {
      console.error("data", (error as any).data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});