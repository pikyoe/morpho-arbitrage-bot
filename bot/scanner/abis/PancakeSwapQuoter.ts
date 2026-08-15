export const PANCAKESWAP_QUOTER_ABI = [
    // PancakeSwap V3 Quoter interface on Base
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
    "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)",
    "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amountOut,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
    "function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn)"
];
