import { network } from "hardhat";
import "dotenv/config";

async function main() {
  const connection = await network.create("baseSepolia");
  const { ethers } = connection as any;

  const morpho = process.env.MORPHO_ADDRESS!;
  if (!morpho) throw new Error("MORPHO_ADDRESS missing");

  const code = await ethers.provider.getCode(morpho);
  console.log("Morpho address:", morpho);
  console.log("Code length:", code.length);

  const signatures = [
    "flashLoan(address,uint256,bytes)",
    "flashLoan(address,uint256)",
    "flashLoan(uint256,bytes)",
    "flashLoan(address,uint256,address,bytes)",
    "flashLoan(address,uint256,bytes,address)",
    "flashLoan(address,address,uint256,bytes)",
    "flashLoan(address,address,uint256)",
    "flashLoan(address,address,uint256,bytes,uint256)",
    "flashLoan(address,uint256,bytes,uint256)",
    "flashLoan(address,address,uint256,bytes,address)",
    "onMorphoFlashLoan(uint256,bytes)",
    "onFlashLoan(address,address,uint256,uint256,bytes)",
    "onFlashLoan(address,uint256,bytes)",
    "onFlashLoan(address,uint256,bytes,address)",
    "onFlashLoan(address,uint256,bytes,bytes)",
    "executeOperation(address,uint256,bytes)",
    "executeOperation(address,address,uint256,bytes)",
    "requestFlashLoan(address,uint256,bytes)",
    "requestFlashLoan(address,uint256)",
    "setEngine(address)",
    "engine()",
    "morpho()",
    "flashToken()",
    "owner()",
    "authorizedCaller(address)",
    "isAuthorized(address)",
    "getOwner()",
  ];

  for (const sig of signatures) {
    const selector = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10).slice(2);
    console.log(sig, selector, code.includes(selector));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});