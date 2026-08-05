import { Contract } from "ethers";
import { provider } from "../../config/provider.js";
import { FEES } from "../../config/uniswap.js";
import { UniswapFactoryABI } from "../../abi/UniswapFactory.js";
const factory = new Contract(process.env.UNISWAP_FACTORY, UniswapFactoryABI, provider);
export async function findPools(tokenA, tokenB) {
    const pools = [];
    for (const fee of FEES) {
        const pool = await factory.getPool(tokenA, tokenB, fee);
        if (pool !==
            "0x0000000000000000000000000000000000000000") {
            pools.push({
                fee,
                address: pool
            });
        }
    }
    return pools;
}
