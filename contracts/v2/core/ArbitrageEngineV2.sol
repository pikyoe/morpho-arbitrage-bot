// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {
    IMorpho,
    IMorphoFlashLoanCallback
} from "../../interfaces/IMorpho.sol";
import "../interfaces/IAdapter.sol";

import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract ArbitrageEngineV2 is Ownable, IMorphoFlashLoanCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ////////////////////////////////////////////////////////////
    //                     IMMUTABLES
    ////////////////////////////////////////////////////////////

    address public immutable morpho;

    ////////////////////////////////////////////////////////////
    //                     STORAGE
    ////////////////////////////////////////////////////////////

    address public profitReceiver;

    address public flashLoanToken;

    uint256 public flashLoanAmount;

    mapping(address => bool) public authorizedCaller;

    ////////////////////////////////////////////////////////////
    //                     MODIFIERS
    ////////////////////////////////////////////////////////////

    modifier onlyAuthorized() {
        if (msg.sender != owner() && !authorizedCaller[msg.sender]) {
            revert Errors.Unauthorized();
        }
        _;
    }

    modifier onlyMorpho() {
        if (msg.sender != morpho) {
            revert Errors.Unauthorized();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                     CONSTRUCTOR
    ////////////////////////////////////////////////////////////

    constructor(address _morpho, address _profitReceiver) Ownable(msg.sender) {
        if (_morpho == address(0)) {
            revert Errors.InvalidAddress();
        }

        if (_profitReceiver == address(0)) {
            revert Errors.InvalidAddress();
        }

        morpho = _morpho;
        profitReceiver = _profitReceiver;
    }

    ////////////////////////////////////////////////////////////
    //                     ADMIN
    ////////////////////////////////////////////////////////////

    function setAuthorizedCaller(address caller, bool status) external onlyOwner {
        if (caller == address(0)) {
            revert Errors.InvalidAddress();
        }

        authorizedCaller[caller] = status;

        emit Events.AuthorizedCallerUpdated(caller, status);
    }

    function setProfitReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) {
            revert Errors.InvalidAddress();
        }

        profitReceiver = receiver;
    }

    ////////////////////////////////////////////////////////////
    //                  FLASH LOAN ENTRYPOINT
    ////////////////////////////////////////////////////////////

    function executeArbitrage(
        address token,
        uint256 amount,
        Strategy.Route calldata route
    ) external onlyAuthorized nonReentrant {
        if (token == address(0)) {
            revert Errors.InvalidToken();
        }

        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        if (flashLoanToken != address(0) || flashLoanAmount != 0) {
            revert Errors.InProgress();
        }

        _validateRoute(route);

        flashLoanToken = token;
        flashLoanAmount = amount;

        emit Events.ArbitrageStarted(token, amount);

        IMorpho(morpho).flashLoan(token, amount, abi.encode(route));
    }

    ////////////////////////////////////////////////////////////
    //                  FLASH LOAN CALLBACK
    ////////////////////////////////////////////////////////////

    function onMorphoFlashLoan(uint256 assets, bytes calldata data)
        external
        onlyMorpho
        nonReentrant
    {
        if (assets == 0) {
            revert Errors.InvalidAmount();
        }

        if (assets != flashLoanAmount) {
            revert Errors.InvalidAmount();
        }

        if (data.length == 0) {
            revert Errors.InvalidRoute();
        }

        if (flashLoanToken == address(0) || flashLoanAmount == 0) {
            revert Errors.InvalidState();
        }

        Strategy.Route memory route = abi.decode(data, (Strategy.Route));
        _validateRoute(route);

        emit Events.FlashLoanReceived(flashLoanToken, assets);

        uint256 currentAmount = _executeRoute(route, assets);

        _approveRepayment();

        uint256 profitAmount = _sendProfit(route);

        emit Events.ArbitrageFinished(profitAmount);
    }

    ////////////////////////////////////////////////////////////
    //                  INTERNAL VALIDATION
    ////////////////////////////////////////////////////////////

    function _validateRoute(Strategy.Route memory route) internal view {
        if (route.swaps.length == 0) {
            revert Errors.InvalidRoute();
        }

        if (route.profitToken == address(0)) {
            revert Errors.InvalidToken();
        }

        for (uint256 i = 0; i < route.swaps.length; i++) {
            Strategy.SwapStep memory step = route.swaps[i];

            if (step.adapter == address(0)) {
                revert Errors.InvalidAdapter();
            }

            if (step.tokenIn == address(0)) {
                revert Errors.InvalidToken();
            }

            if (step.tokenOut == address(0)) {
                revert Errors.InvalidToken();
            }
        }

        Strategy.SwapStep memory lastSwap = route.swaps[route.swaps.length - 1];
        if (lastSwap.tokenOut != flashLoanToken) {
            revert Errors.InvalidRoute();
        }
    }

    function _executeRoute(Strategy.Route memory route, uint256 initialAmount)
        internal
        returns (uint256 currentAmount)
    {
        currentAmount = initialAmount;

        for (uint256 i = 0; i < route.swaps.length; i++) {
            currentAmount = _executeSwap(route.swaps[i], currentAmount);
        }
    }

    function _executeSwap(Strategy.SwapStep memory step, uint256 currentAmount)
        internal
        returns (uint256 amountOut)
    {
        uint256 amountIn = step.amountIn;
        if (amountIn == 0) {
            amountIn = currentAmount;
        }

        if (amountIn > IERC20(step.tokenIn).balanceOf(address(this))) {
            revert Errors.InsufficientBalance();
        }

        step.amountIn = amountIn;

        IERC20(step.tokenIn).forceApprove(step.adapter, amountIn);

        amountOut = IAdapter(step.adapter).swap(step);

        emit Events.SwapExecuted(
            step.adapter,
            step.tokenIn,
            step.tokenOut,
            amountIn,
            amountOut
        );
    }

    function _approveRepayment() internal {
        uint256 repayBalance = IERC20(flashLoanToken).balanceOf(address(this));
        if (repayBalance < flashLoanAmount) {
            revert Errors.RepaymentFailed();
        }

        IERC20(flashLoanToken).forceApprove(morpho, repayBalance);

        emit Events.FlashLoanRepaid(flashLoanToken, repayBalance);
    }

    function _sendProfit(Strategy.Route memory route) internal returns (uint256 profitAmount) {
        if (route.profitToken == flashLoanToken) {
            profitAmount = IERC20(flashLoanToken).balanceOf(address(this)) - flashLoanAmount;
        } else {
            profitAmount = IERC20(route.profitToken).balanceOf(address(this));
        }

        if (profitAmount < route.minProfit) {
            revert Errors.InsufficientProfit();
        }

        if (profitAmount > 0) {
            IERC20(route.profitToken).safeTransfer(profitReceiver, profitAmount);
        }

        flashLoanToken = address(0);
        flashLoanAmount = 0;
    }
}