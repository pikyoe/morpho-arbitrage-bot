import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const morphoAddress = process.env.MORPHO_ADDRESS!;
  const wrapperAddress = process.env.MORPHO_FLASHLOAN_V2_ADDRESS!;

  const morphoCode = await ethers.provider.getCode(morphoAddress);
  const wrapperCode = await ethers.provider.getCode(wrapperAddress);

  const signatures = [
    "requestFlashLoan(address,uint256,bytes)",
    "flashLoan(address,uint256,bytes)",
    "onMorphoFlashLoan(uint256,bytes)",
    "setEngine(address)",
    "engine()",
    "morpho()",
    "flashToken()",
    "owner()",
    "authorizedCaller(address)",
    "isAuthorized(address)",
  ];

  console.log("morpho code length", morphoCode.length, morphoCode.slice(0, 20));
  console.log("wrapper code length", wrapperCode.length, wrapperCode.slice(0, 20));

  for (const sig of signatures) {
    const selector = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10).slice(2);
    console.log(sig, selector, "morpho", morphoCode.includes(selector), "wrapper", wrapperCode.includes(selector));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});