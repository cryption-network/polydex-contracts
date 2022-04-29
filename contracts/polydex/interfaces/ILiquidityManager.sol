// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface ILiquidityManager {
    function handleDeposit(
        address token,
        uint256 amount,
        address user
    ) external returns (uint256);

    function handleWithdraw(
        address token,
        uint256 amount,
        address user
    ) external returns (uint256);
}
