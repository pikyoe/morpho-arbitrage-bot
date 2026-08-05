export class AdapterRegistry {

    constructor(

        public readonly uniswap: string,

        public readonly aerodrome: string

    ) {}

    get(dex: string): string {

        switch (dex) {

            case "UNISWAP":
                return this.uniswap;

            case "AERODROME":
                return this.aerodrome;

            default:
                throw new Error("Unknown DEX");

        }

    }

}
