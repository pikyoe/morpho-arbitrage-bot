import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const morphoAddress = process.env.MORPHO_ADDRESS!;
  const morphoFlashLoanAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS!;
  const token = process.env.FLASHLOAN_TOKEN ?? "0x4200000000000000000000000000000000000006";
  const amount = ethers.parseEther("0.1");

  console.log({ morphoAddress, morphoFlashLoanAddress, token, amount: amount.toString() });

  const flashLoanSelector = ethers.keccak256(ethers.toUtf8Bytes("flashLoan(address,uint256,bytes)")).slice(0, 10);
  const payload = flashLoanSelector + ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bytes"], [token, amount, "0x"]).slice(2);
  console.log("payload", payload);

  for (const from of [
    undefined,
    morphoFlashLoanAddress,
    "0x0000000000000000000000000000000000000000",
  ]) {
    try {
      const callTx: any = { to: morphoAddress, data: payload };
      if (from) callTx.from = from;
      console.log("calling from", from ?? "<omitted>");
      const result = await ethers.provider.call(callTx);
      console.log("eth_call result from", from ?? "<default>", result);
    } catch (error) {
      console.error("eth_call revert from", from ?? "<default>", error);
      if ((error as any).data) {
        console.error("data:", (error as any).data);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});