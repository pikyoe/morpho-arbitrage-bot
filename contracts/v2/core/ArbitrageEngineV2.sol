// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/IMorphoFlashLoan.sol";
import "../interfaces/IFlashLoanReceiver.sol";
import "../interfaces/IAdapter.sol";

import "../libraries/Strategy.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract ArbitrageEngineV2 is Ownable, IFlashLoanReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ////////////////////////////////////////////////////////////
    //                     IMMUTABLES
    ////////////////////////////////////////////////////////////

    address public immutable morphoFlashLoan;

    ////////////////////////////////////////////////////////////
    //                     STORAGE
    ////////////////////////////////////////////////////////////

    address public profitReceiver;

    address public flashLoanToken;

    uint256 public flashLoanAmount;

    bool public paused;

    mapping(address => bool) public authorizedCaller;

    mapping(address => bool) public approvedAdapter;

    ////////////////////////////////////////////////////////////
    //                     MODIFIERS
    ////////////////////////////////////////////////////////////

    modifier onlyAuthorized() {
        if (msg.sender != owner() && !authorizedCaller[msg.sender]) {
            revert Errors.Unauthorized();
        }
        _;
    }

    modifier onlyFlashLoan() {
        if (msg.sender != morphoFlashLoan) {
            revert Errors.Unauthorized();
        }
        _;
    }

    modifier whenNotPaused() {
        if (paused) {
            revert Errors.InvalidState();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                     CONSTRUCTOR
    ////////////////////////////////////////////////////////////

    constructor(address _morphoFlashLoan, address _profitReceiver) Ownable(msg.sender) {
        if (_morphoFlashLoan == address(0)) {
            revert Errors.InvalidAddress();
        }

        if (_profitReceiver == address(0)) {
            revert Errors.InvalidAddress();
        }

        morphoFlashLoan = _morphoFlashLoan;
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

    function setPaused(bool status) external onlyOwner {
        paused = status;
        emit Events.Paused(status);
    }

    function setApprovedAdapter(address adapter, bool status) external onlyOwner {
        if (adapter == address(0)) {
            revert Errors.InvalidAddress();
        }

        approvedAdapter[adapter] = status;

        emit Events.AdapterApproved(adapter, status);
    }

    ////////////////////////////////////////////////////////////
    //                  FLASH LOAN ENTRYPOINT
    ////////////////////////////////////////////////////////////

    function executeArbitrage(
        address token,
        uint256 amount,
        Strategy.Route calldata route
    ) external onlyAuthorized whenNotPaused nonReentrant {
        if (token == address(0)) {
            revert Errors.InvalidToken();
        }

        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        if (flashLoanToken != address(0) || flashLoanAmount != 0) {
            revert Errors.InProgress();
        }

        _validateRoute(route, token);

        emit Events.RouteValidated(token, msg.sender);

        flashLoanToken = token;
        flashLoanAmount = amount;

        emit Events.ArbitrageStarted(token, amount);

        IMorphoFlashLoan(morphoFlashLoan).requestFlashLoan(token, amount, abi.encode(route));
    }

    ////////////////////////////////////////////////////////////
    //                  FLASH LOAN CALLBACK
    ////////////////////////////////////////////////////////////

    function executeOperation(
        address token,
        uint256 amount,
        bytes calldata data
    ) external onlyFlashLoan whenNotPaused nonReentrant {
        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        if (token != flashLoanToken) {
            revert Errors.InvalidToken();
        }

        if (amount != flashLoanAmount) {
            revert Errors.InvalidAmount();
        }

        if (data.length == 0) {
            revert Errors.InvalidRoute();
        }

        if (flashLoanToken == address(0) || flashLoanAmount == 0) {
            revert Errors.InvalidState();
        }

        Strategy.Route memory route = abi.decode(data, (Strategy.Route));
        _validateRoute(route, token);

        emit Events.FlashLoanReceived(flashLoanToken, amount);

        _executeRoute(route, amount);

        _approveRepayment();

        uint256 profitAmount = _sendProfit(route);

        emit Events.ArbitrageFinished(profitAmount);
    }

    ////////////////////////////////////////////////////////////
    //                  INTERNAL VALIDATION
    ////////////////////////////////////////////////////////////

    function _validateRoute(Strategy.Route memory route, address token) internal view {
        if (route.swaps.length == 0) {
            revert Errors.InvalidRoute();
        }

        if (route.profitToken == address(0)) {
            revert Errors.InvalidToken();
        }

        if (route.swaps[0].tokenIn != token) {
            revert Errors.InvalidRoute();
        }

        address previousTokenOut = route.swaps[0].tokenOut;

        for (uint256 i = 0; i < route.swaps.length; i++) {
            Strategy.SwapStep memory step = route.swaps[i];

            if (step.adapter == address(0)) {
                revert Errors.InvalidAdapter();
            }

            if (!approvedAdapter[step.adapter]) {
                revert Errors.InvalidAdapter();
            }

            if (step.tokenIn == address(0)) {
                revert Errors.InvalidToken();
            }

            if (step.tokenOut == address(0)) {
                revert Errors.InvalidToken();
            }

            if (i > 0 && step.tokenIn != previousTokenOut) {
                revert Errors.InvalidRoute();
            }

            previousTokenOut = step.tokenOut;
        }

        Strategy.SwapStep memory lastSwap = route.swaps[route.swaps.length - 1];
        if (lastSwap.tokenOut != token) {
            revert Errors.InvalidRoute();
        }
    }

    // View helper to validate a route off-chain
    function validateRoute(Strategy.Route calldata route, address token) external view returns (bool) {
        _validateRoute(route, token);
        return true;
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

        if (amountOut < step.minAmountOut) {
            revert Errors.ZeroOutput();
        }

        IERC20(step.tokenIn).forceApprove(step.adapter, 0);

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

        IERC20(flashLoanToken).safeTransfer(morphoFlashLoan, flashLoanAmount);

        emit Events.FlashLoanRepaid(flashLoanToken, flashLoanAmount);
    }

    function _sendProfit(Strategy.Route memory route) internal returns (uint256 profitAmount) {
        profitAmount = IERC20(route.profitToken).balanceOf(address(this));

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
