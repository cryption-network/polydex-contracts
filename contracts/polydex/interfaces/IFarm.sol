// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IFarm {
    function withdrawFor(
        uint256 _pid,
        uint256 _amount,
        address _user
    ) external;

    function depositFor(
        uint256 _pid,
        uint256 _amount,
        address _user
    ) external;

    function poolLength() external view returns (uint256);
}
