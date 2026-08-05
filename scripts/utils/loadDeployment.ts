import fs from "fs";
import path from "path";
import hre from "hardhat";

import {
    DeploymentFile,
    emptyDeployment,
    validateDeployment
} from "./deployment.js";

function resolveNetworkName(): string {
    const networkName =
        (hre.network as any)?.name ??
        process.env.HARDHAT_NETWORK ??
        "localhost";

    return networkName;
}

export function deploymentFilePath(
    network?: string
): string {

    const name =
        network ??
        resolveNetworkName();

    return path.join(
        process.cwd(),
        "deployments",
        `${name}.json`
    );
}

export function deploymentExists(
    network?: string
): boolean {

    return fs.existsSync(
        deploymentFilePath(network)
    );
}

export function loadDeployment(
    network?: string
): DeploymentFile {

    const file =
        deploymentFilePath(network);

    if (!fs.existsSync(file)) {
        throw new Error(
            [
                "",
                "Deployment file not found.",
                `File : ${file}`,
                "",
                "Deploy contracts first.",
                ""
            ].join("\n")
        );
    }

    const raw =
        fs.readFileSync(
            file,
            "utf8"
        );

    const deployment =
        JSON.parse(raw) as DeploymentFile;

    validateDeployment(
        deployment
    );

    return deployment;
}

export function tryLoadDeployment(
    network?: string
): DeploymentFile {

    if (!deploymentExists(network)) {
        return emptyDeployment();
    }

    return loadDeployment(
        network
    );
}

export function printDeployment(
    deployment: DeploymentFile
): void {

    console.log("");
    console.log("============================================================");
    console.log("DEPLOYMENT");
    console.log("============================================================");

    console.log(
        "Network               :",
        deployment.metadata.network
    );

    console.log(
        "Chain ID              :",
        deployment.metadata.chainId
    );

    console.log(
        "Deployer              :",
        deployment.metadata.deployer
    );

    console.log(
        "Deployed At           :",
        deployment.metadata.deployedAt
    );

    console.log("");
    console.log("Contracts");
    console.log("------------------------------------------------------------");

    console.log(
        "MorphoFlashLoanV2     :",
        deployment.contracts.morphoFlashLoan
    );

    console.log(
        "ArbitrageEngineV2     :",
        deployment.contracts.arbitrageEngine
    );

    console.log(
        "UniswapV3AdapterV2    :",
        deployment.contracts.uniswapAdapter
    );

    console.log(
        "AerodromeAdapterV2    :",
        deployment.contracts.aerodromeAdapter
    );

    console.log("============================================================");
}

export default loadDeployment;