// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Strategy {

    struct SwapStep {

        address adapter;

        address tokenIn;

        address tokenOut;

        uint24 fee;

        uint256 amountIn;

        uint256 minAmountOut;

        bytes data;

        uint256 deadline;
    }

}