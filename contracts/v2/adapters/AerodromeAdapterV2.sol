// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IAerodromeRouter.sol";

import "../interfaces/IAdapter.sol";
import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract AerodromeAdapterV2 is
    Ownable,
    IAdapter
{
    using SafeERC20 for IERC20;

    address public immutable router;

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

        IERC20(step.tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            step.amountIn
        );

        if (step.data.length == 0) {
            revert Errors.InvalidRoute();
        }

        (bool stable, address factory) =
            abi.decode(
                step.data,
                (bool, address)
            );

        IERC20(step.tokenIn).forceApprove(
            router,
            step.amountIn
        );

        IAerodromeRouter.Route[]
            memory routes =
                new IAerodromeRouter.Route[](1);

        routes[0] = IAerodromeRouter.Route({
            from: step.tokenIn,
            to: step.tokenOut,
            stable: stable,
            factory: factory
        });

        uint256 deadline = step.deadline == 0 ? block.timestamp + 30 : step.deadline;

        if (deadline <= block.timestamp) {
            revert Errors.DeadlineExpired();
        }

        uint256[] memory amounts =
            IAerodromeRouter(router)
                .swapExactTokensForTokens(
                    step.amountIn,
                    step.minAmountOut,
                    routes,
                    engine,
                    deadline
                );

        if (amounts.length == 0) {
            revert Errors.AdapterOutputZero();
        }

        amountOut =
            amounts[amounts.length - 1];

        IERC20(step.tokenIn).forceApprove(
            router,
            0
        );

        emit Events.SwapExecuted(
            address(this),
            step.tokenIn,
            step.tokenOut,
            step.amountIn,
            amountOut
        );
    }
}