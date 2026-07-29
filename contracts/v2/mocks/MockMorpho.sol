// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IMorpho.sol";

contract MockMorpho is IMorpho {
    using SafeERC20 for IERC20;

    function flashLoan(
        address token,
        uint256 amount,
        bytes calldata data
    ) external override {
        IERC20(token).safeTransfer(msg.sender, amount);
        IMorphoFlashLoanCallback(msg.sender).onMorphoFlashLoan(amount, data);
    }
}
