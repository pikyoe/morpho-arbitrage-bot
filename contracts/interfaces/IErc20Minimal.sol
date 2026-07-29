// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IErc20Minimal {

    function balanceOf(
        address account
    )
        external
        view
        returns(uint256);

}