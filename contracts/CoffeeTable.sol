// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import './libraries/NativeMetaTransaction.sol';
import './libraries/ContextMixin.sol';
// CoffeeTable is the coolest bar in town. You come in with some CNT, and leave with more! The longer you stay, the more CNT you get.
//
// This contract handles swapping to and from xCNT, SwapCafe's staking token.
contract CoffeeTable is ERC20("CoffeeTable", "xCNT") , ContextMixin , NativeMetaTransaction {
    using SafeMath for uint256;
    IERC20 public cnt;

    // Define the CNT token contract
    constructor(IERC20 _cnt) public {
        cnt = _cnt;
    }

    function _msgSender()
        internal
        view
        override
        returns (address payable sender)
    {
        return ContextMixin.msgSender();
    }
    

    // Enter the bar. Pay some CNTs. Earn some shares.
    // Locks CNT and mints xCNT
    function enter(uint256 _amount) public {
        // Gets the amount of CNT locked in the contract
        uint256 totalCNT = cnt.balanceOf(address(this));
        // Gets the amount of xCNT in existence
        uint256 totalShares = totalSupply();
        // If no xCNT exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalCNT == 0) {
            _mint(_msgSender, _amount);
        } 
        // Calculate and mint the amount of xCNT the CNT is worth. The ratio will change overtime, as xCNT is burned/minted and CNT deposited + gained from fees / withdrawn.
        else {
            uint256 what = _amount.mul(totalShares).div(totalCNT);
            _mint(_msgSender, what);
        }
        // Lock the CNT in the contract
        cnt.transferFrom(_msgSender, address(this), _amount);
    }

    // Leave the bar. Claim back your CNTs.
    // Unclocks the staked + gained CNT and burns xCNT
    function leave(uint256 _share) public {
        // Gets the amount of xCNT in existence
        uint256 totalShares = totalSupply();
        // Calculates the amount of CNT the xCNT is worth
        uint256 what = _share.mul(cnt.balanceOf(address(this))).div(totalShares);
        _burn(_msgSender, _share);
        cnt.transfer(_msgSender, what);
    }
}