// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../libraries/Strategy.sol";

interface IAdapter {
    function swap(Strategy.SwapStep memory step) external returns (uint256);
}