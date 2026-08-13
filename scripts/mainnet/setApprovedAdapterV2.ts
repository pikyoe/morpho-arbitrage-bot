import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

const ENGINE_ABI = [
  "function setApprovedAdapter(address adapter,bool approved)",
  "function approvedAdapter(address adapter) view returns (bool)"
];

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;
  loadEnvForNetwork(hre);
  await ensureChain([8453n, 31337n, 84532n], connection);

  const [signer] = await ethers.getSigners();
  const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
  const adapterAddress = process.env.ADAPTER_ADDRESS;
  const approved = process.env.ADAPTER_APPROVED !== "false";
  const dryRun = process.env.DRY_RUN !== "false";

  if (!engineAddress || !ethers.isAddress(engineAddress) || engineAddress === ethers.ZeroAddress) {
    throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS is missing or invalid");
  }
  if (!adapterAddress || !ethers.isAddress(adapterAddress) || adapterAddress === ethers.ZeroAddress) {
    throw new Error("ADAPTER_ADDRESS is missing or invalid");
  }

  const engine = new ethers.Contract(engineAddress, ENGINE_ABI, signer);
  const before = await engine.approvedAdapter(adapterAddress);
  console.log("Engine:", engineAddress);
  console.log("Adapter:", adapterAddress);
  console.log("Approved before:", before);
  console.log("Requested approved:", approved);
  console.log("Signer:", signer.address);
  console.log("Dry run:", dryRun);

  if (dryRun) {
    console.log("DRY_RUN=true; no registration transaction sent.");
    return;
  }

  const tx = await engine.setApprovedAdapter(adapterAddress, approved);
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Registration transaction failed");
  console.log("Approved after:", await engine.approvedAdapter(adapterAddress));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
