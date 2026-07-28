export function gasETHtoUSDC(

    gasWei: bigint,

    wethPriceUSDC: bigint

): bigint {

    return (

        gasWei *

        wethPriceUSDC

    ) /

    1000000000000000000n;

}