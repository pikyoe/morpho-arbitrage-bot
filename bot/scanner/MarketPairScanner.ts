import { ethers } from "ethers";
import { QuoteEngine } from "./QuoteEngine.js";
import { GasEstimator } from "../gas/GasEstimator.js";
import { OpportunityId } from "../utils/OpportunityId.js";
import { PriceOracle } from "../oracle/PriceOracle.js";
import {
    AdaptivePositionSearcher,
    DefaultPositionSearchConfig
} from "./AdaptivePositionSearcher.js";
import {
    PositionPoint,
    PositionSizer
} from "./PositionSizer.js";
import {
    ProfitCurve
} from "./ProfitCurve.js";
import {
    ProfitPeakDetector
} from "./ProfitPeakDetector.js";
import {
    QuoteResult
} from "./quote/index.js";

export interface ArbitrageCandidate {

    id?: string;

    forward: QuoteResult;

    reverse: QuoteResult;

    amountIn: bigint;

    amountBack: bigint;

    profit: bigint;

    ////////////////////////////////////////////////////////

    grossProfitUSD?: number;

    flashLoanFeeUSD?: number;

    gasCostUSD?: number;

    netProfitUSD?: number;

    profitable?: boolean;

}

export class MarketPairScanner {

    constructor(

        private readonly quoteEngine: QuoteEngine,
        private readonly priceOracle?: PriceOracle

    ) {}

    private readonly GAS_LIMIT = 650000n;

    private readonly FLASH_LOAN_FEE = 0.0005;

    private readonly SAFETY_BUFFER = 0.25;

    public async scan(

        tokenA: string,

        tokenB: string,

        defaultAmount?: bigint

    ): Promise<ArbitrageCandidate[]> {

        //
        // Jika caller memberikan amount,
        // gunakan amount tersebut saja.
        //

        const amounts =

            defaultAmount

                ? [defaultAmount]

                : AdaptivePositionSearcher.generate(

                    DefaultPositionSearchConfig

                );

        const gasPrice =
            await this.priceOracle?.getGasPrice() ?? 0n;

        const ethPriceUSDValue =
            await this.priceOracle?.getEthPriceUSD() ?? 0;

        const bestCandidates: ArbitrageCandidate[] = [];
        const tested: PositionPoint[] = [];
        const curve = new ProfitCurve();

        for (const amountIn of amounts) {

            const forwardQuotes =

                await this.quoteEngine.getAllQuotes({

                    tokenIn: tokenA,

                    tokenOut: tokenB,

                    amountIn

                });

            let bestForAmount: ArbitrageCandidate | null = null;

            for (const forward of forwardQuotes) {

                const reverseQuotes =

                    await this.quoteEngine.getAllQuotes({

                        tokenIn: tokenB,

                        tokenOut: tokenA,

                        amountIn: forward.amountOut

                    });

                for (const reverse of reverseQuotes) {

                    //
                    // Arbitrase harus lintas DEX
                    //

                    if (

                        forward.dex === reverse.dex

                    ) {

                        continue;

                    }

                    const amountBack =

                        reverse.amountOut;

                    if (

                        amountBack <= amountIn

                    ) {

                        continue;

                    }

                    const profit =

                        amountBack - amountIn;

                    //
                    // Profit kasar minimal 0.01%
                    //
                    // Hindari menghitung gas untuk
                    // peluang yang jelas rugi.
                    //

                    const minimumGrossProfit =

                        amountIn / 10000n;

                    if (

                        profit < minimumGrossProfit

                    ) {

                        continue;

                    }

                    const grossProfitETH =

                        Number(

                            profit > 0n

                                ? ethers.formatEther(profit)

                                : 0

                        );

                    const grossProfitUSD =

                        grossProfitETH *

                        ethPriceUSDValue;

//
// Morpho fee
//

const flashLoanFeeUSD =

    Number(

        ethers.formatEther(amountIn)

    )

    *

    ethPriceUSDValue

    *

    this.FLASH_LOAN_FEE;

const gas =

    GasEstimator.estimate({

        grossProfitUSD,

        gasLimit:

            this.GAS_LIMIT,

        gasPrice:

            gasPrice,

        ethPriceUSD:

            ethPriceUSDValue,

        flashLoanFeeUSD,

        safetyBufferUSD:

            this.SAFETY_BUFFER

    });

                    const candidate: ArbitrageCandidate = {

                        forward,

                        reverse,

                        amountIn,

                        amountBack,

                        profit,

                        grossProfitUSD,

                        flashLoanFeeUSD,

                        gasCostUSD:

                            gas.gasCostUSD,

                        netProfitUSD:

                            gas.netProfitUSD,

                        profitable:

                            gas.profitable

                    };

                    candidate.id =

                        OpportunityId.create(candidate);

                    if (
                        !bestForAmount ||
                        (candidate.netProfitUSD ?? -Infinity) >
                        (bestForAmount.netProfitUSD ?? -Infinity)
                    ) {
                        bestForAmount = candidate;
                    }

                }

            }

            if (bestForAmount) {
                bestCandidates.push(bestForAmount);
                tested.push({
                    amountIn: bestForAmount.amountIn,
                    netProfitUSD: bestForAmount.netProfitUSD ?? 0
                });

                curve.add(
                    amountIn,
                    bestForAmount.netProfitUSD ?? 0
                );

                if (
                    ProfitPeakDetector.reachedPeak(curve)
                ) {
                    console.log();
                    console.log(
                        "Profit peak detected."
                    );
                    break;
                }

                if (
                    curve.isProfitDropping()
                ) {
                    console.log(
                        "Profit started dropping."
                    );
                    break;
                }
            }

        }

        if (bestCandidates.length === 0) {
            return [];
        }

        const positionResult =
            PositionSizer.choose(tested);

        const selectedAmount =
            positionResult.bestAmount;

        return bestCandidates.filter(
            candidate =>
                candidate.amountIn === selectedAmount
        );

    }

}