import { ProfitCurve } from "./ProfitCurve.js";

export class ProfitPeakDetector {

    static reachedPeak(

        curve: ProfitCurve,

        tolerance = 0.02

    ): boolean {

        const last = curve.last();
        const prev = curve.previous();

        if (!last || !prev) {

            return false;

        }

        if (last.profitUSD <= prev.profitUSD) {

            return true;

        }

        const growth =

            (last.profitUSD - prev.profitUSD)
            /
            Math.max(prev.profitUSD, 0.000001);

        return growth < tolerance;

    }

}