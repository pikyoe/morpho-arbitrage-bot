export function swapFee(

    amount: bigint,

    feeBps: bigint

): bigint {

    return (

        amount *

        feeBps

    ) / 10000n;

}