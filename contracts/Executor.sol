// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Executor is Ownable, Pausable {

    using SafeERC20 for IERC20;

    address public morphoExecutor;

    event ETHWithdrawn(
        address indexed owner,
        uint256 amount
    );

    event TokenWithdrawn(
        address indexed token,
        address indexed owner,
        uint256 amount
    );

    constructor(
        address initialOwner
    )
        Ownable(initialOwner)
    {}

    function setMorphoExecutor(
        address _morphoExecutor
    )
        external
        onlyOwner
    {
        morphoExecutor = _morphoExecutor;
    }

    receive() external payable {}

}