// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import "../interfaces/IAdapter.sol";
import "../interfaces/IPancakeV3Router.sol";

import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";



// Same flow as UniswapV3AdapterV2 but targets PancakeSwap V3's SwapRouter,
// whose exactInputSingle requires `deadline` inside the params struct.
contract PancakeSwapV3AdapterV2 is
    Ownable,
    IAdapter
{
    using SafeERC20 for IERC20;


    address public immutable router;


    address public engine;



    modifier onlyEngine()
    {
        if(msg.sender != engine)
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

        if(_router == address(0))
            revert Errors.InvalidAddress();

        if(engineAddress == address(0))
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
        returns(
            uint256 amountOut
        )
    {
        if (step.amountIn == 0) {
            revert Errors.InvalidAmount();
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

        uint256 deadline = step.deadline == 0 ? block.timestamp + 30 : step.deadline;

        if (deadline <= block.timestamp) {
            revert Errors.DeadlineExpired();
        }

        amountOut =
            IPancakeV3Router(router)
            .exactInputSingle(
                IPancakeV3Router
                .ExactInputSingleParams({
                    tokenIn: step.tokenIn,
                    tokenOut: step.tokenOut,
                    fee: step.fee,
                    recipient: engine,
                    deadline: deadline,
                    amountIn: step.amountIn,
                    amountOutMinimum: step.minAmountOut,
                    sqrtPriceLimitX96: 0
                })
            );

        IERC20(step.tokenIn)
            .forceApprove(router, 0);

        emit Events.SwapExecuted(
            address(this),
            step.tokenIn,
            step.tokenOut,
            step.amountIn,
            amountOut
        );


    }


}
