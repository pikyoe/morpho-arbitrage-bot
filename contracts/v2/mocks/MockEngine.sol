// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAdapter.sol";
import "../libraries/Strategy.sol";

contract MockEngine {

    function approveToken(
        address token,
        address spender,
        uint256 amount
    ) external {
        IERC20(token).approve(spender, amount);
    }

    function executeSwap(
        address adapter,
        Strategy.SwapStep calldata step
    ) external returns (uint256) {
        return IAdapter(adapter).swap(step);
    }

    function tokenBalance(address token)
        external
        view
        returns (uint256)
    {
        return IERC20(token).balanceOf(address(this));
    }
}