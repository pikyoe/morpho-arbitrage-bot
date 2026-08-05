export interface ProfitPoint {

    amount: bigint;

    profitUSD: number;

}

export class ProfitCurve {

    private readonly points: ProfitPoint[] = [];

    add(

        amount: bigint,

        profitUSD: number

    ) {

        this.points.push({

            amount,

            profitUSD

        });

    }

    getAll() {

        return this.points;

    }

    last(): ProfitPoint | undefined {

        return this.points.at(-1);

    }

    previous(): ProfitPoint | undefined {

        return this.points.at(-2);

    }

    public isProfitDropping(): boolean {

        if (this.points.length < 2)

            return false;

        return (

            this.points.at(-1)!.profitUSD

            <

            this.points.at(-2)!.profitUSD

        );

    }

}