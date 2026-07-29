// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IFlashLoanReceiver {

    function executeOperation(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external;

}
