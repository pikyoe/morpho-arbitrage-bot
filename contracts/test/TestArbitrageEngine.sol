// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../v2/core/ArbitrageEngineV2.sol";
import "../v2/libraries/Strategy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestArbitrageEngine is ArbitrageEngineV2 {

    constructor(
        address initialOwner,
        address morphoFlashLoan,
        address profitReceiver,
        address uniswapAdapter,
        address aerodromeAdapter
    )
        ArbitrageEngineV2(
            initialOwner,
            morphoFlashLoan,
            profitReceiver,
            uniswapAdapter,
            aerodromeAdapter
        )
    {}

    function testExecuteSwap(
        Strategy.SwapStep calldata step
    )
        external
        returns (uint256)
    {
        return _executeSwap(
            step,
            step.amountIn,
            0
        );
    }

    function testExecuteSwapRaw(
        address target,
        bytes calldata data
    )
        external
        returns (bytes memory)
    {
        (bool success, bytes memory returnData) = target.call(data);

        if (!success) {
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        return returnData;
    }

    function approveForTest(
        address token,
        address spender,
        uint256 amount
    )
        external
    {
        IERC20(token).approve(
            spender,
            amount
        );
    }

    function balanceOf(
        address token
    )
        external
        view
        returns(uint256)
    {
        return IERC20(token).balanceOf(
            address(this)
        );
    }
}