import { ethers } from "ethers";

import {
    ArbitrageEngine
} from "../../typechain-types";

import {
    ScannerResult
} from "../scanner/OpportunityScanner";

export class RouteSimulator {
    constructor(private engine: ArbitrageEngine) {}

    public async simulate(
        token: string,
        amount: bigint,
        opportunity: ScannerResult
    ): Promise<boolean> {
        try {
            await this.engine.executeArbitrage.staticCall(
                token,
                amount,
                opportunity.route
            );

            console.log("Simulation OK");

            return true;
        } catch (error: any) {
            console.log();
            console.log("Simulation FAILED");
            console.log(error.shortMessage ?? error.message);

            return false;
        }
    }
}

