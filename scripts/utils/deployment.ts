export interface ContractAddresses {
    morphoFlashLoan: string;
    arbitrageEngine: string;
    uniswapAdapter: string;
    aerodromeAdapter: string;
    sushiSwapAdapter?: string;
    pancakeSwapAdapter?: string;
}

export interface DeploymentMetadata {
    network: string;
    chainId: number;
    deployer: string;
    deployedAt: string;
    version: string;
}

export interface DeploymentFile {
    metadata: DeploymentMetadata;
    contracts: ContractAddresses;
}

export function emptyDeployment(): DeploymentFile {
    return {
        metadata: {
            network: "",
            chainId: 0,
            deployer: "",
            deployedAt: "",
            version: "2.0.0"
        },
        contracts: {
            morphoFlashLoan: "",
            arbitrageEngine: "",
            uniswapAdapter: "",
            aerodromeAdapter: ""
        }
    };
}

export function validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateDeployment(
    deployment: DeploymentFile
): void {

    const {
        morphoFlashLoan,
        arbitrageEngine,
        uniswapAdapter,
        aerodromeAdapter
    } = deployment.contracts;

    const contracts = [
        ["MorphoFlashLoanV2", morphoFlashLoan],
        ["ArbitrageEngineV2", arbitrageEngine],
        ["UniswapV3AdapterV2", uniswapAdapter],
        ["AerodromeAdapterV2", aerodromeAdapter]
    ];

    for (const [name, address] of contracts) {

        if (address.length === 0) {
            continue;
        }

        if (!validateAddress(address)) {
            throw new Error(
                `${name} has invalid address: ${address}`
            );
        }
    }
}