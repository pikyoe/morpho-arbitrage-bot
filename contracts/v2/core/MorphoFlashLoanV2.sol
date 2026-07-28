// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import "../interfaces/IMorpho.sol";
import "../interfaces/IFlashLoanReceiver.sol";


import "../libraries/Errors.sol";
import "../libraries/Events.sol";



contract MorphoFlashLoanV2 is Ownable {


    using SafeERC20 for IERC20;



    address public immutable morpho;


    address public engine;


    address public flashToken;



    modifier onlyEngine()
    {
        if(msg.sender != engine)
            revert Errors.Unauthorized();

        _;
    }




    modifier onlyMorpho()
    {
        if(msg.sender != morpho)
            revert Errors.Unauthorized();

        _;
    }





    constructor(
        address initialOwner,
        address _morpho
    )
        Ownable(initialOwner)
    {

        if(
            _morpho == address(0)
        )
            revert Errors.InvalidAddress();


        morpho = _morpho;

    }






    function setEngine(
        address _engine
    )
        external
        onlyOwner
    {

        if(
            _engine == address(0)
        )
            revert Errors.InvalidAddress();


        engine = _engine;


        emit Events.EngineUpdated(
            _engine
        );

    }








    function requestFlashLoan(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external
        onlyEngine
    {


        if(
            amount == 0
        )
            revert Errors.InvalidAmount();



        flashToken = token;



        emit Events.FlashLoanRequested(
            token,
            amount
        );



        IMorpho(
            morpho
        )
        .flashLoan(
            token,
            amount,
            data
        );

    }








    function onMorphoFlashLoan(
        uint256 assets,
        bytes calldata data
    )
        external
        onlyMorpho
    {


        if(
            engine == address(0)
        )
            revert Errors.InvalidAddress();



        address token =
            flashToken;



        if(
            token == address(0)
        )
            revert Errors.InvalidAddress();





        emit Events.FlashLoanReceived(
            token,
            assets
        );





        IERC20(token)
            .safeTransfer(
                engine,
                assets
            );






        IFlashLoanReceiver(
            engine
        )
        .executeOperation(
            token,
            assets,
            data
        );







        uint256 balance =
            IERC20(token)
            .balanceOf(
                address(this)
            );



        if(
            balance < assets
        )
            revert Errors.RepaymentFailed();





        IERC20(token)
            .forceApprove(
                morpho,
                balance
            );





        emit Events.FlashLoanRepaid(
            token,
            balance
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


        IERC20(token)
            .safeTransfer(
                owner(),
                amount
            );

    }

}