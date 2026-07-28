// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


interface IUniswapV3Adapter {


    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    )
        external
        returns(
            uint256 amountOut
        );

}