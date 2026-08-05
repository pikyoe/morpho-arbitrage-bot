export async function ensureChain(expectedChainId: bigint | bigint[], runtime?: any) {
  let provider: any;

  const candidates = [
    runtime,
    runtime?.provider,
    runtime?.ethers,
    runtime?.ethers?.provider,
    runtime?.network,
    runtime?.network?.provider,
    runtime?.network?.ethers,
    runtime?.network?.ethers?.provider,
    runtime?.hardhatProvider,
    runtime?.hardhatNetwork,
    runtime?.hardhatNetwork?.provider,
  ];

  for (const candidate of candidates) {
    if (candidate?.getNetwork) {
      provider = candidate;
      break;
    }

    if (candidate?.provider?.getNetwork) {
      provider = candidate.provider;
      break;
    }
  }

  if (!provider?.getNetwork) {
    try {
      const hardhatModule = await import("hardhat");
      const hardhatRuntime = hardhatModule.default ?? hardhatModule;
      provider = (hardhatRuntime as any).ethers?.provider ?? (hardhatRuntime as any).provider;
    } catch {
      provider = undefined;
    }
  }

  if (!provider?.getNetwork) {
    throw new Error("Unable to resolve an ethers provider for network validation");
  }

  const network = await provider.getNetwork();
  const actualChainId = BigInt(network.chainId);
  const allowedChainIds = Array.isArray(expectedChainId)
    ? expectedChainId
    : [expectedChainId];

  console.log(
    "Network:",
    network.name,
    "chainId:",
    actualChainId.toString()
  );

  if (!allowedChainIds.some((chainId) => BigInt(chainId) === actualChainId)) {
    throw new Error(
      `Expected chainId ${allowedChainIds.map((chainId) => chainId.toString()).join(" or ")} but got ${actualChainId}`
    );
  }
}
