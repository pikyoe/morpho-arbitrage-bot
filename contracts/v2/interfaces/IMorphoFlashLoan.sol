// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


interface IMorphoFlashLoan {


    function requestFlashLoan(
        address token,
        uint256 amount,
        bytes calldata data
    )
        external;


}