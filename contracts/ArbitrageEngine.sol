// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import "./interfaces/IMorphoFlashLoan.sol";
import "./interfaces/IUniswapV3Adapter.sol";


contract ArbitrageEngine is Ownable {

    using SafeERC20 for IERC20;


    address public immutable morphoFlashLoan;


    address public uniswapAdapter;


    mapping(address => bool)
    public authorizedCaller;



    event CallerAuthorization(
        address caller,
        bool status
    );


    event AdapterUpdated(
        address adapter
    );


    event ArbitrageStarted(
        address token,
        uint256 amount
    );


    event CallbackReceived(
        address token,
        uint256 amount
    );


    event SwapExecuted(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );


    event ProfitWithdrawn(
        address token,
        uint256 amount
    );

    event DebugStep(
    string step
    );



    constructor(
        address initialOwner,
        address _morphoFlashLoan
    )
        Ownable(initialOwner)
    {

        require(
            _morphoFlashLoan != address(0),
            "Invalid flash loan"
        );


        morphoFlashLoan =
            _morphoFlashLoan;
    }



    modifier onlyAuthorized()
    {
        require(
            authorizedCaller[msg.sender],
            "Not authorized caller"
        );

        _;
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




    function setUniswapAdapter(
        address adapter
    )
        external
        onlyOwner
    {

        require(
            adapter != address(0),
            "Invalid adapter"
        );


        uniswapAdapter =
            adapter;


        emit AdapterUpdated(
            adapter
        );
    }




    function executeArbitrage(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external
        onlyAuthorized
    {


        emit ArbitrageStarted(
            token,
            amount
        );



        IMorphoFlashLoan(
            morphoFlashLoan
        )
        .requestFlashLoan(
            token,
            amount,
            data
        );
    }





    function executeOperation(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external
    {

        require(
            msg.sender == morphoFlashLoan,
            "Only flash loan"
        );

        emit DebugStep("FlashLoan callback received");


        emit CallbackReceived(
            token,
            amount
        );



        require(
            uniswapAdapter != address(0),
            "Adapter missing"
        );



        (
            address tokenIn,
            address tokenOut,
            uint24 fee,
            uint256 amountOutMinimum

        )
        =
        abi.decode(
            data,
            (
                address,
                address,
                uint24,
                uint256
            )
        );



        uint256 beforeBalance =
            IERC20(tokenOut)
            .balanceOf(
                address(this)
            );



        IERC20(tokenIn)
            .forceApprove(
                uniswapAdapter,
                amount
            );



        uint256 amountOut =
            IUniswapV3Adapter(
                uniswapAdapter
            )
            .swapExactInputSingle(
                tokenIn,
                tokenOut,
                fee,
                amount,
                amountOutMinimum
            );



        uint256 afterBalance =
            IERC20(tokenOut)
            .balanceOf(
                address(this)
            );



        uint256 received =
            afterBalance -
            beforeBalance;


        emit DebugStep("Before swap");

        emit SwapExecuted(
            tokenIn,
            tokenOut,
            amount,
            received,
            block.timestamp
        );
        emit DebugStep("After swap");


    }





    function withdrawToken(
        address token
    )
        external
        onlyOwner
    {

        uint256 balance =
            IERC20(token)
            .balanceOf(
                address(this)
            );


        require(
            balance > 0,
            "No balance"
        );


        IERC20(token)
            .safeTransfer(
                owner(),
                balance
            );


        emit ProfitWithdrawn(
            token,
            balance
        );
    }





    function rescueETH()
        external
        onlyOwner
    {
        payable(owner())
        .transfer(
            address(this)
            .balance
        );
    }




    receive()
        external
        payable
    {}

}