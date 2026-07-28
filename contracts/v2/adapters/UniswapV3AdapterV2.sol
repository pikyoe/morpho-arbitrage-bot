// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import "../interfaces/IAdapter.sol";
import "../interfaces/IUniswapV3Router.sol";

import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";



contract UniswapV3AdapterV2 is
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
        address _router
    )
        Ownable(initialOwner)
    {

        if(_router == address(0))
            revert Errors.InvalidAddress();


        router = _router;

    }





    function setEngine(
        address _engine
    )
        external
        onlyOwner
    {

        if(_engine == address(0))
            revert Errors.InvalidAddress();


        engine = _engine;

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


        IERC20(step.tokenIn)
            .forceApprove(
                router,
                step.amountIn
            );



        amountOut =
            IUniswapV3Router(router)
            .exactInputSingle(
                IUniswapV3Router
                .ExactInputSingleParams({

                    tokenIn:
                        step.tokenIn,

                    tokenOut:
                        step.tokenOut,

                    fee:
                        3000,

                    recipient:
                        engine,

                    deadline:
                        block.timestamp + 300,

                    amountIn:
                        step.amountIn,

                    amountOutMinimum:
                        step.minAmountOut,

                    sqrtPriceLimitX96:
                        0
                })
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