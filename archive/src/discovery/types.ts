export interface Pool {

    dex: string;

    pool: string;

    tokenIn: string;

    tokenOut: string;

    fee?: number;

    stable?: boolean;

}