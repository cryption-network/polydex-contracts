// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IPolydexCallee {
    function polydexCall(address sender, uint amount0, uint amount1, bytes calldata data) external;
}