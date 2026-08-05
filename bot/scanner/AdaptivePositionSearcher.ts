export interface PositionSearchConfig {

    start: bigint;

    max: bigint;

    multiplier: number;

}

export const DefaultPositionSearchConfig: PositionSearchConfig = {

    start: 10_000_000_000_000_000n,       // 0.01 WETH

    max: 5_000_000_000_000_000_000n,      // 5 WETH

    multiplier: 2

};

export class AdaptivePositionSearcher {

    static generate(

        config: PositionSearchConfig

    ): bigint[] {

        const amounts: bigint[] = [];

        let current = config.start;

        while (current <= config.max) {

            amounts.push(current);

            current = BigInt(

                Math.floor(

                    Number(current) *

                    config.multiplier

                )

            );

        }

        return amounts;

    }

}