export function flashLoanFee(

    amount: bigint,

    bps = 5n

): bigint {

    return (

        amount *

        bps

    ) / 10000n;

}