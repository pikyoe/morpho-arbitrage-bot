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

    error ZeroOutput();

    error InvalidSlippage();

    error RescueFailed();

    error DeadlineExpired();

    error InvalidToken();

    error InsufficientBalance();

    error InProgress();

    error InvalidState();
}