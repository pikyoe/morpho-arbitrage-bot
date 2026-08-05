import fs from "fs";
import path from "path";

import {
    DeploymentFile,
    validateDeployment
} from "./deployment.js";

export interface SaveDeploymentOptions {
    network: string;
    overwrite?: boolean;
}

export function saveDeployment(
    deployment: DeploymentFile,
    options: SaveDeploymentOptions
): string {

    validateDeployment(deployment);

    const deploymentsDir = path.join(
        process.cwd(),
        "deployments"
    );

    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, {
            recursive: true
        });
    }

    const filePath = path.join(
        deploymentsDir,
        `${options.network}.json`
    );

    if (
        fs.existsSync(filePath) &&
        options.overwrite === false
    ) {
        throw new Error(
            `Deployment file already exists:\n${filePath}`
        );
    }

    deployment.metadata.deployedAt =
        new Date().toISOString();

    fs.writeFileSync(
        filePath,
        JSON.stringify(
            deployment,
            null,
            4
        ),
        {
            encoding: "utf8"
        }
    );

    console.log("");
    console.log("========================================");
    console.log("DEPLOYMENT SAVED");
    console.log("========================================");
    console.log("File      :", filePath);
    console.log("Network   :", deployment.metadata.network);
    console.log("Chain ID  :", deployment.metadata.chainId);
    console.log("Deployer  :", deployment.metadata.deployer);
    console.log("");
    console.log("Contracts");
    console.log("----------------------------------------");
    console.log(
        "MorphoFlashLoanV2 :",
        deployment.contracts.morphoFlashLoan
    );
    console.log(
        "ArbitrageEngineV2:",
        deployment.contracts.arbitrageEngine
    );
    console.log(
        "UniswapV3AdapterV2:",
        deployment.contracts.uniswapAdapter
    );
    console.log(
        "AerodromeAdapterV2:",
        deployment.contracts.aerodromeAdapter
    );
    console.log("========================================");
    console.log("");

    return filePath;
}

export default saveDeployment;