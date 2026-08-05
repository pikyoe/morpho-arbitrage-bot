import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { ensureChain } from "../utils/validateNetwork.js";

async function main() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;

  // Load environment file appropriate for the selected network
  loadEnvForNetwork(hre);
  // ensureChain([8453n, 31337n, 84532n]); // Temporarily disabled

  const [deployer] = await ethers.getSigners();
  const networkName = (hre.network as any).name ?? "unknown";
  const chainId = (hre.network as any).config?.chainId ?? "unknown";
  console.log("Network:", networkName, "chainId:", chainId);
  console.log("Signer:", deployer.address);

  const Factory = await ethers.getContractFactory("AerodromeAdapterV2");

  const router = process.env.AERODROME_ROUTER;

    if (!router) {
        throw new Error("AERODROME_ROUTER missing");
    }

    if (!ethers.isAddress(router)) {
        throw new Error("Invalid AERODROME_ROUTER");
    }

    // For now, use deployer address as placeholder for engine (will be set later)
    const adapter =
        await Factory.deploy(

            deployer.address,

            router,
            deployer.address

        );

    await adapter.waitForDeployment();

    console.log(
        "AerodromeAdapterV2:",
        await adapter.getAddress()
    );

}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});