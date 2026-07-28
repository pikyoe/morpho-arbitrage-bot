// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "../interfaces/IAerodromeRouter.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract AerodromeAdapter is Ownable {

    using SafeERC20 for IERC20;


    address public immutable router;



    constructor(
        address initialOwner,
        address _router
    )
        Ownable(initialOwner)
    {
        router = _router;
    }




    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bool stable,
        address factory
    )
        external
        onlyOwner
        returns(
            uint256 amountOut
        )
    {

        IERC20(tokenIn)
            .forceApprove(
                router,
                amountIn
            );


        IAerodromeRouter.Route[]
            memory routes =
            new IAerodromeRouter.Route[](1);


        routes[0] =
            IAerodromeRouter.Route({
                from: tokenIn,
                to: tokenOut,
                stable: stable,
                factory: factory
            });



        uint256[] memory amounts =
            IAerodromeRouter(router)
            .swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                routes,
                address(this),
                block.timestamp + 300
            );


        amountOut =
            amounts[
                amounts.length - 1
            ];
    }



    receive()
        external
        payable
    {}

}