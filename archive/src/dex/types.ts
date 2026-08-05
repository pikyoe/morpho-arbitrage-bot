export interface Dex {

    name: string;

    quote(

        tokenIn: string,

        tokenOut: string,

        amountIn: bigint

    ): Promise<bigint>;

}