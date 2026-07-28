// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "../interfaces/IUniswapV3Router.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../v2/interfaces/IAdapter.sol";
import "../v2/libraries/Strategy.sol";
import "../v2/libraries/Errors.sol";



contract UniswapV3Adapter is Ownable, IAdapter {

    using SafeERC20 for IERC20;



    address public immutable router;

    address public engine;

    mapping(address => bool)
        public authorizedCaller;



    event CallerAuthorization(
        address indexed caller,
        bool status
    );


    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );



    modifier onlyAuthorized()
    {
        require(
            msg.sender == owner()
            ||
            authorizedCaller[msg.sender],
            "Not authorized"
        );

        _;
    }

    modifier onlyEngine() {
        if (msg.sender != engine) {
            revert Errors.Unauthorized();
        }
        _;
    }





    constructor(
        address initialOwner,
        address _router
    )
        Ownable(initialOwner)
    {

        require(
            _router != address(0),
            "Invalid router"
        );


        router = _router;
    }






    function setAuthorizedCaller(
        address caller,
        bool status
    )
        external
        onlyOwner
    {

        require(
            caller != address(0),
            "Invalid caller"
        );


        authorizedCaller[caller] =
            status;


        emit CallerAuthorization(
            caller,
            status
        );
    }

    function setEngine(address _engine)
        external
        onlyOwner
    {
        require(_engine != address(0), "Invalid engine");
        engine = _engine;
    }








    function swap(Strategy.SwapStep calldata step)
        external
        onlyEngine
        returns (uint256 amountOut)
    {
        require(engine != address(0), "Engine not set");
        require(step.amountIn > 0, "Invalid amount");

        IERC20(step.tokenIn).forceApprove(router, step.amountIn);

        amountOut = _swapExactInputSingle(
            step.tokenIn,
            step.tokenOut,
            3000,
            step.amountIn,
            step.minAmountOut,
            engine
        );

        emit SwapExecuted(step.tokenIn, step.tokenOut, step.amountIn, amountOut);
    }

    function _swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient
    ) internal returns (uint256 amountOut) {
        amountOut = IUniswapV3Router(router).exactInputSingle(
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    )
        external
        onlyAuthorized
        returns(uint256 amountOut)
    {
        require(amountIn > 0, "Invalid amount");

        IERC20(tokenIn)
            .forceApprove(
                router,
                amountIn
            );



        amountOut = _swapExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            amountOutMinimum,
            msg.sender
        );



        emit SwapExecuted(
            tokenIn,
            tokenOut,
            amountIn,
            amountOut
        );
    }





    function rescueToken(
        address token
    )
        external
        onlyOwner
    {

        IERC20(token)
            .safeTransfer(
                owner(),
                IERC20(token)
                .balanceOf(
                    address(this)
                )
            );
    }




    receive()
        external
        payable
    {}

}