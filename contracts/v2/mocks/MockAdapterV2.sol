// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAdapter.sol";
import "../libraries/Strategy.sol";

contract MockAdapterV2 is IAdapter {
    using SafeERC20 for IERC20;

    function swap(Strategy.SwapStep calldata step) external returns (uint256 amountOut) {
        IERC20(step.tokenIn).safeTransferFrom(msg.sender, address(this), step.amountIn);
        IERC20(step.tokenOut).safeTransfer(msg.sender, step.minAmountOut == 0 ? step.amountIn : step.minAmountOut);
        amountOut = step.minAmountOut == 0 ? step.amountIn : step.minAmountOut;
    }
}
