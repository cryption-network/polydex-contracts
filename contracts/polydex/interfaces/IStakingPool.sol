// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IStakingPool {
    function depositFor(uint256 amount, address to) external;
}