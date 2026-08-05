export function applySlippage(

    amount: bigint,

    bps: bigint

): bigint {

    return (

        amount *

        (10000n - bps)

    ) / 10000n;

}