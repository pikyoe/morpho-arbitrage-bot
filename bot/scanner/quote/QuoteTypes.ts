export interface QuoteRequest {

    tokenIn: string;

    tokenOut: string;

    amountIn: bigint;

}

export interface QuoteResult {

    dex: string;

    pool: string;

    tokenIn: string;

    tokenOut: string;

    amountIn: bigint;

    amountOut: bigint;

    fee?: number;

    stable?: boolean;

    factory?: string;

}