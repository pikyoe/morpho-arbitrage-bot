// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// PancakeSwap V3 SwapRouter (0x1b81D678ffb9C0263b24A97847620C99d213eB14 on Base).
// Unlike Uniswap's SwapRouter02 it keeps `deadline` inside the params struct
// (selector 0x414bf389). It does NOT implement the SwapRouter02-style
// exactInputSingle without deadline (0x04e45aaf).
interface IPancakeV3Router {

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    )
        external
        payable
        returns (
            uint256 amountOut
        );

}
