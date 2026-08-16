// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../../v2/libraries/Strategy.sol";

interface IDexAdapter {

    function swap(
        Strategy.SwapStep calldata step
    )
        external
        returns (uint256 amountOut);

}