// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract KOMWrapper is ERC20, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    IERC20 public immutable komToken;

    constructor(IERC20 _komToken) ERC20("Wrapped KOM", "WKOM") {
        komToken = _komToken;
    }

    /**
     * @dev Allow a user to deposit komToken tokens and mint the corresponding number of wrapped tokens.
     */
    function deposit(uint256 _amount)
        public
        virtual
        onlyOwner
        nonReentrant
        returns (bool)
    {
        //Receiving KOM;
        SafeERC20.safeTransferFrom(
            komToken,
            _msgSender(),
            address(this),
            _amount
        );
        //Scaling KOM to WKOM
        uint256 wrappedAmount = _amount.mul(1e18).div(1e8);
        //Minting WKOM
        _mint(_msgSender(), wrappedAmount);
        return true;
    }

    /**
     * @dev Allow a user to burn a number of wrapped tokens and withdraw the corresponding number of komToken tokens.
     */
    function withdraw(address _recipient, uint256 _amount)
        public
        virtual
        returns (bool)
    {
        //burn WKOM
        _burn(_recipient, _amount);
        //Scaling down WKOM to KOM
        uint256 komAmount = _amount.mul(1e8).div(1e18);
        //Transferring KOM
        SafeERC20.safeTransfer(komToken, _recipient, komAmount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount)
        public
        override
        returns (bool)
    {
        withdraw(_recipient, _amount);
        return true;
    }
}
