// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../libraries/Strategy.sol";

interface IAdapter {

    function swap(
        Strategy.SwapStep calldata step
    )
        external
        returns (
            uint256 amountOut
        );
}