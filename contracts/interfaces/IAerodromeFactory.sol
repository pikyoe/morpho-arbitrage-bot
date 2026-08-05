// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAerodromeFactory {

    function getPool(
        address tokenA,
        address tokenB,
        bool stable
    )
        external
        view
        returns(address);

}