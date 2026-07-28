// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Errors {

    error Unauthorized();

    error InvalidAddress();

    error InvalidAmount();

    error InvalidRoute();

    error InvalidAdapter();

    error AdapterNotAuthorized();

    error FlashLoanFailed();

    error SwapFailed();

    error RepaymentFailed();

    error InsufficientProfit();

    error ZeroOutput();

    error DeadlineExpired();

    error InvalidToken();

    error InvalidCaller();

    error InsufficientBalance();

    error InProgress();

    error InvalidState();
}