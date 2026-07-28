// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


interface IMorpho {

    function flashLoan(
        address token,
        uint256 assets,
        bytes calldata data
    )
        external;

}



interface IArbitrageEngine {

    function executeOperation(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external;

}



contract MorphoFlashLoan is Ownable {

    using SafeERC20 for IERC20;


    address public immutable morpho;


    address public engine;



    mapping(address => bool)
    public authorizedCaller;



    event EngineUpdated(
        address engine
    );


    event FlashLoanRequested(
        address token,
        uint256 amount
    );


    event FlashLoanCompleted(
        address token,
        uint256 amount
    );


    event CallbackReceived(
        address token,
        uint256 amount
    );

    event Debug(
     string message
     );



    constructor(
        address initialOwner,
        address _morpho
    )
        Ownable(initialOwner)
    {

        require(
            _morpho != address(0),
            "Invalid morpho"
        );

        morpho = _morpho;
    }





    modifier onlyAuthorized()
    {
        require(
            authorizedCaller[msg.sender],
            "Not authorized"
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

        authorizedCaller[caller] = status;

    }





    function setEngine(
        address _engine
    )
        external
        onlyOwner
    {

        require(
            _engine != address(0),
            "Invalid engine"
        );


        engine = _engine;


        emit EngineUpdated(
            _engine
        );
    }







    function requestFlashLoan(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external
        onlyAuthorized
    {


        emit FlashLoanRequested(
            token,
            amount
        );



        IMorpho(morpho)
            .flashLoan(
                token,
                amount,
                data
            );

    }








    /*
        Morpho callback

        Morpho:
        - sends token
        - calls this function
        - pulls token back after callback
    */


    function onMorphoFlashLoan(
        uint256 assets,
        bytes calldata data
    )
        external
    {

        require(
            msg.sender == morpho,
            "Only Morpho"
        );


        require(
            engine != address(0),
            "Engine missing"
        );



        address token = abi.decode(
            data,
            (
                address
            )
        );

        emit Debug(
         "Morpho callback"
         );



        emit CallbackReceived(
            token,
            assets
        );



        /*
            Send borrowed asset
            to ArbitrageEngine
        */


        IERC20(token)
            .safeTransfer(
                engine,
                assets
            );




        /*
            Execute swaps

            WETH
             |
             v
            USDC
             |
             v
            WETH
        */


        IArbitrageEngine(engine)
            .executeOperation(
                token,
                assets,
                data
            );





        /*
            Engine must return WETH
            here before callback ends
        */


        uint256 balance =
            IERC20(token)
            .balanceOf(
                address(this)
            );



        require(
            balance >= assets,
            "Insufficient repayment"
        );



        IERC20(token)
            .forceApprove(
                morpho,
                assets
            );



        emit FlashLoanCompleted(
            token,
            assets
        );

        emit Debug(
         "Engine finished"
         );

    }







    function rescueToken(
        address token
    )
        external
        onlyOwner
    {

        uint256 amount =
            IERC20(token)
            .balanceOf(
                address(this)
            );

        emit Debug(
         "Sending token to engine"
         );


        IERC20(token)
            .safeTransfer(
                owner(),
                amount
            );

    }



    receive()
        external
        payable
    {}

}