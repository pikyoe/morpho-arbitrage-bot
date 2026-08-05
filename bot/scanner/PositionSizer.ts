export interface PositionPoint {

    amountIn: bigint;

    netProfitUSD: number;

}

export interface PositionResult {

    bestAmount: bigint;

    bestProfitUSD: number;

    tested: PositionPoint[];

}

export class PositionSizer {

    static choose(points: PositionPoint[]): PositionResult {

        if (points.length == 0) {

            throw new Error(

                "No position tested."

            );

        }

        let best = points[0];

        for (const point of points) {

            if (

                point.netProfitUSD >

                best.netProfitUSD

            ) {

                best = point;

            }

        }

        return {

            bestAmount:
                best.amountIn,

            bestProfitUSD:
                best.netProfitUSD,

            tested: points

        };

    }

}