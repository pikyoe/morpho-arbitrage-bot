// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Events {

    event FlashLoanRequested(
        address indexed token,
        uint256 amount
    );

    event FlashLoanReceived(
        address indexed token,
        uint256 amount
    );

    event FlashLoanRepaid(
        address indexed token,
        uint256 amount
    );

    event SwapExecuted(
        address indexed adapter,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event ArbitrageStarted(
        address indexed token,
        uint256 amount
    );

    event ArbitrageFinished(
        uint256 profit
    );

    event AdapterUpdated(
        address indexed adapter
    );

    event AdapterApproved(
        address indexed adapter,
        bool status
    );

    event Paused(
        bool status
    );

    event EngineUpdated(
        address indexed engine
    );

    event AuthorizedCallerUpdated(
        address indexed caller,
        bool status
    );
    
        event RouteValidated(
            address indexed token,
            address indexed caller
        );
}