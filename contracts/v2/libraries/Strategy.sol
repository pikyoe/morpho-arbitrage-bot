// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Strategy {

    struct SwapStep {

        address adapter;

        address tokenIn;

        address tokenOut;

        uint256 amountIn;

        uint256 minAmountOut;

        bytes data; 
    }

    struct Route {

        SwapStep[] swaps;

        address profitToken;

        uint256 minProfit;
    }

}