import { Contract } from "ethers";

import { provider } from "../config/provider.js";
import { ADDRESSES } from "../config/addresses.js";

const ABI = [

    "function getPool(address,address,uint24) view returns(address)"

];

const factory =

    new Contract(

        ADDRESSES.UNISWAP_FACTORY,

        ABI,

        provider

    );

export async function getPool(

    tokenA: string,

    tokenB: string,

    fee: number

): Promise<string> {

    return await factory.getPool(

        tokenA,

        tokenB,

        fee

    );

}