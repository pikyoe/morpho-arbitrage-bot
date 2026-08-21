// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Errors {

    error Unauthorized();

    error InvalidAddress();

    error InvalidAmount();

    error InvalidRoute();

    error InvalidAdapter();

    error RepaymentFailed();

    error InsufficientProfit();

    // stepIndex identifies which swap leg under-delivered; amountOut is the
    // actual leg output versus the engine's expected minAmountOut.
    error ZeroOutput(uint256 stepIndex, uint256 amountOut, uint256 minAmountOut);

    // Adapter-level zero output (no route data; adapter does not know its index).
    error AdapterOutputZero();

    error InvalidSlippage();

    error RescueFailed();

    error DeadlineExpired();

    error InvalidToken();

    error InsufficientBalance();

    error InProgress();

    error InvalidState();
}