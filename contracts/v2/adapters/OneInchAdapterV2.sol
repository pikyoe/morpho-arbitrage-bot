// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IAdapter.sol";
import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

/**
 * @title OneInchAdapterV2
 * @notice Executes a pre-encoded 1inch AggregationRouterV6 swap as one leg of an
 *         ArbitrageEngineV2 flash-loan route.
 *
 * The bot fetches swap calldata from the 1inch Swap API
 * (GET /swap/v6.0/8453/swap?from=<this adapter>&receiver=<this adapter>&disableEstimate=true)
 * right before execution and passes the calldata through Strategy.SwapStep.data.
 * The router pulls step.amountIn of step.tokenIn from this adapter and delivers the
 * output of step.tokenOut back to this adapter, which forwards it to the engine.
 *
 * The calldata is amount-specific, so the bot must use the exact input amount the
 * calldata was built for (never 0/"use the engine balance").
 */
contract OneInchAdapterV2 is
    Ownable,
    IAdapter
{
    using SafeERC20 for IERC20;

    /// 1inch AggregationRouterV6 (same canonical address on every EVM chain).
    address public immutable router;

    /// ArbitrageEngineV2 that is allowed to call swap().
    address public engine;

    modifier onlyEngine() {
        if (msg.sender != engine)
            revert Errors.Unauthorized();
        _;
    }

    constructor(
        address initialOwner,
        address _router,
        address engineAddress
    )
        Ownable(initialOwner)
    {
        if (_router == address(0))
            revert Errors.InvalidAddress();

        if (engineAddress == address(0))
            revert Errors.InvalidAddress();

        router = _router;
        engine = engineAddress;
    }

    function setEngine(
        address newEngine
    )
        external
        onlyOwner
    {
        if (newEngine == address(0)) {
            revert Errors.InvalidAddress();
        }

        engine = newEngine;
    }

    function swap(
        Strategy.SwapStep calldata step
    )
        external
        onlyEngine
        returns (uint256 amountOut)
    {
        if (step.amountIn == 0) {
            revert Errors.InvalidAmount();
        }

        if (step.data.length == 0) {
            revert Errors.InvalidRoute();
        }

        uint256 deadline = step.deadline == 0 ? block.timestamp + 30 : step.deadline;

        if (deadline <= block.timestamp) {
            revert Errors.DeadlineExpired();
        }

        IERC20(step.tokenIn)
            .safeTransferFrom(
                msg.sender,
                address(this),
                step.amountIn
            );

        IERC20(step.tokenIn)
            .forceApprove(
                router,
                step.amountIn
            );

        // Execute the 1inch calldata. It encodes src/dst/amount/from=this/
        // receiver=this and carries its own embedded deadline + minReturn; the
        // engine additionally enforces step.minAmountOut below.
        (bool success, bytes memory returnData) = router.call(step.data);
        if (!success) {
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        IERC20(step.tokenIn)
            .forceApprove(router, 0);

        amountOut = IERC20(step.tokenOut).balanceOf(address(this));
        if (amountOut < step.minAmountOut) {
            revert Errors.AdapterOutputZero();
        }

        IERC20(step.tokenOut)
            .safeTransfer(msg.sender, amountOut);

        emit Events.SwapExecuted(
            address(this),
            step.tokenIn,
            step.tokenOut,
            step.amountIn,
            amountOut
        );
    }
}
