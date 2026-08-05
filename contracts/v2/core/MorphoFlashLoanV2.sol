// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";


import "../interfaces/IMorpho.sol";
import "../interfaces/IFlashLoanReceiver.sol";


import "../libraries/Errors.sol";
import "../libraries/Events.sol";



contract MorphoFlashLoanV2 is Ownable, Pausable {


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

    modifier onlyWhenNotPaused()
    {
        if(paused())
            revert Errors.InvalidState();

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






    function setPaused(
        bool status
    )
        external
        onlyOwner
    {
        if (status) {
            if (!paused()) {
                _pause();
            }
        } else {
            if (paused()) {
                _unpause();
            }
        }

        emit Events.Paused(status);
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
        onlyWhenNotPaused
    {


        if(
            flashToken != address(0)
        )
            revert Errors.InProgress();


        if(
            token == address(0)
        )
            revert Errors.InvalidToken();


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
        onlyWhenNotPaused
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
                assets
            );





        emit Events.FlashLoanRepaid(
            token,
            assets
        );

        flashToken = address(0);

    }








    function rescueToken(
        address token,
        uint256 amount
    )
        external
        onlyOwner
    {

        if(
            token == address(0)
        )
            revert Errors.InvalidToken();

        if(
            token == flashToken
        )
            revert Errors.InProgress();


        uint256 balance =
            IERC20(token)
            .balanceOf(
                address(this)
            );

        if(
            amount == 0 || amount > balance
        )
            revert Errors.InvalidAmount();


        IERC20(token)
            .safeTransfer(
                owner(),
                amount
            );

    }

    function rescueETH(
        uint256 amount
    )
        external
        onlyOwner
    {
        if(
            amount == 0
        )
            revert Errors.InvalidAmount();

        uint256 balance =
            address(this)
            .balance;

        if(
            amount > balance
        )
            revert Errors.InvalidAmount();

        (bool success, ) =
            payable(owner())
            .call{value: amount}("");

        if(!success)
            revert Errors.RescueFailed();
    }

}