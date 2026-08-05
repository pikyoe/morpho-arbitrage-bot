export const UNISWAP_POOL_ABI = [
    "function token0() view returns(address)",
    "function token1() view returns(address)",
    "function fee() view returns(uint24)",
    "function liquidity() view returns(uint128)",
    "function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
];
