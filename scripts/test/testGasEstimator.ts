import hre from "hardhat";
import { GasEstimator } from "../../bot/gas/GasEstimator.js";

async function runCase(
    title: string,
    grossProfitUSD: number,
    gasLimit: bigint,
    gasPrice: bigint,
    ethPriceUSD: number,
    flashLoanFeeUSD = 0,
    safetyBufferUSD = 0
) {
    console.log("\n================================================");
    console.log(title);
    console.log("================================================");

    const result = GasEstimator.estimate({

        grossProfitUSD,

        gasLimit,

        gasPrice,

        ethPriceUSD,

        flashLoanFeeUSD,

        safetyBufferUSD

    });

    console.table({

        GrossProfitUSD:
            result.grossProfitUSD,

        GasCostUSD:
            result.gasCostUSD,

        FlashLoanFeeUSD:
            result.flashLoanFeeUSD,

        SafetyBufferUSD:
            result.safetyBufferUSD,

        NetProfitUSD:
            result.netProfitUSD,

        GasRatio:
            `${(result.gasRatio * 100).toFixed(2)} %`,

        Profitable:
            result.profitable

    });

    console.log("Gas Limit :", result.gasLimit.toString());

    console.log("Gas Price :", result.gasPrice.toString());

    console.log("Gas Cost ETH :", result.gasCostETH);

    console.log("Gas Cost Wei :", result.gasCostWei.toString());
}

async function main() {

    const connection: any =
        await hre.network.connect();

    const { ethers } = connection;

    const feeData =
        await ethers.provider.getFeeData();

    const gasPrice =
        feeData.gasPrice!;

    console.log("\nCurrent Gas Price");

    console.log(gasPrice.toString());

    const ETH_PRICE = 4000;

    await runCase(

        "CASE 1 - Healthy Arbitrage",

        15,

        400000n,

        gasPrice,

        ETH_PRICE,

        0.30,

        0.20

    );

    await runCase(

        "CASE 2 - Small Profit",

        2,

        400000n,

        gasPrice,

        ETH_PRICE,

        0.30,

        0.20

    );

    await runCase(

        "CASE 3 - High Gas",

        8,

        2000000n,

        gasPrice,

        ETH_PRICE,

        0.30,

        0.20

    );

    await runCase(

        "CASE 4 - Flash Fee",

        5,

        400000n,

        gasPrice,

        ETH_PRICE,

        2.50,

        0.20

    );

    await runCase(

        "CASE 5 - Negative Profit",

        0.50,

        400000n,

        gasPrice,

        ETH_PRICE,

        0.50,

        0.20

    );

}

main().catch(console.error);
