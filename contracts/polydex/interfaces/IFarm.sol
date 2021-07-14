// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IFarm {
    function depositFor(uint256 pid, uint256 amount, address to) external;
}