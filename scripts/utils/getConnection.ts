import hre from "hardhat";

export interface ConnectionContext {
    hre: typeof hre;
    connection: any;
    ethers: any;
    network: any;
    provider: any;
    signer: any;
    deployer: string;
    chainId: bigint;
    networkName: string;
}

export async function getConnection(): Promise<ConnectionContext> {
    const connection: any = await hre.network.create();

    const { ethers, network } = connection;

    const provider = ethers.provider;

    const signer = await provider.getSigner();

    const deployer = await signer.getAddress();

    const networkInfo = await provider.getNetwork();

    const chainId = networkInfo.chainId;

    const knownChainNames: Record<number, string> = {
        1: "mainnet",
        5: "goerli",
        11155111: "sepolia",
        8453: "base",
        31337: "localhost",
        1337: "localhost"
    };

    const networkName =
        (hre.network as any)?.name ??
        network?.name ??
        knownChainNames[chainId] ??
        `unknown-${chainId}`;

    return {
        hre,
        connection,
        ethers,
        network,
        provider,
        signer,
        deployer,
        chainId,
        networkName
    };
}

export default getConnection;