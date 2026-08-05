export interface SearchRange {

    low: bigint;

    high: bigint;

}

export interface PositionEvaluator {

    evaluate(

        amount: bigint

    ): Promise<number>;

}

export class BinaryPositionSearcher {

    static midpoint(

        low: bigint,

        high: bigint

    ): bigint {

        return (low + high) / 2n;

    }

    static split(

        range: SearchRange

    ) {

        const mid =

            this.midpoint(

                range.low,

                range.high

            );

        return {

            left: {

                low: range.low,

                high: mid

            },

            right: {

                low: mid,

                high: range.high

            }

        };

    }

    static async search(

        evaluator: PositionEvaluator,

        low: bigint,

        high: bigint,

        iterations = 5

    ): Promise<bigint> {

        let left = low;

        let right = high;

        for (

            let i = 0;

            i < iterations;

            i++

        ) {

            const mid =

                this.midpoint(

                    left,

                    right

                );

            const leftProfit =

                await evaluator.evaluate(left);

            const midProfit =

                await evaluator.evaluate(mid);

            if (

                midProfit >

                leftProfit

            ) {

                left = mid;

            }

            else {

                right = mid;

            }

        }

        return this.midpoint(

            left,

            right

        );

    }

}