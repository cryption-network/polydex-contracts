// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libraries/TransferHelper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/NativeMetaTransaction.sol";
import "./libraries/ContextMixin.sol";

contract StakingPool is Ownable, ContextMixin, NativeMetaTransaction {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice information stuct on each user than stakes LP tokens.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt.
        uint256 rewardLockedUp; // Reward locked up.
        uint256 nextHarvestUntil; // When can the user harvest again.
    }

    /// @notice all the settings for this farm in one struct
    struct FarmInfo {
        IERC20 lpToken;
        IERC20 rewardToken;
        uint256 startBlock;
        uint256 blockReward;
        uint256 bonusEndBlock;
        uint256 bonus;
        uint256 endBlock;
        uint256 lastRewardBlock; // Last block number that reward distribution occurs.
        uint256 accRewardPerShare; // Accumulated Rewards per share, times 1e12
        uint256 farmableSupply; // set in init, total amount of tokens farmable
        uint256 numFarmers;
        uint16 withdrawlFeeBP; // Deposit fee in basis points
        uint256 harvestInterval; // Harvest interval in seconds
    }

    // Deposit Fee address
    address public feeAddress;
    // Max harvest interval: 14 days.
    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days;

    // Max deposit fee: 10%. This number is later divided by 10000 for calculations.
    uint16 public constant MAXIMUM_WITHDRAWL_FEE_BP = 1000;

    // Total locked up rewards
    uint256 public totalLockedUpRewards;

    FarmInfo public farmInfo;

    /// @notice information on each user than stakes LP tokens
    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardLockedUp(address indexed user, uint256 amountLockedUp);

    constructor(address _feeAddress) public {
        _initializeEIP712("StakingPool");
        feeAddress = _feeAddress;
    }

    function _msgSender()
        internal
        view
        override
        returns (address payable sender)
    {
        return ContextMixin.msgSender();
    }

    /**
     * @notice initialize the farming contract.
     * This is called only once upon farm creation and the FarmGenerator ensures the farm has the correct paramaters
     */
    function init(
        IERC20 _rewardToken,
        uint256 _amount,
        IERC20 _lpToken,
        uint256 _blockReward,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _bonusEndBlock,
        uint16 _withdrawlFeeBP,
        uint256 _harvestInterval,
        uint256 _bonus
    ) external onlyOwner {
        require(
            _withdrawlFeeBP <= MAXIMUM_WITHDRAWL_FEE_BP,
            "add: invalid deposit fee basis points"
        );
        require(
            _harvestInterval <= MAXIMUM_HARVEST_INTERVAL,
            "add: invalid harvest interval"
        );

        TransferHelper.safeTransferFrom(
            address(_rewardToken),
            _msgSender(),
            address(this),
            _amount
        );
        farmInfo.rewardToken = _rewardToken;

        farmInfo.startBlock = _startBlock;
        farmInfo.blockReward = _blockReward;
        farmInfo.bonusEndBlock = _bonusEndBlock;
        farmInfo.bonus = _bonus;

        uint256 lastRewardBlock =
            block.number > _startBlock ? block.number : _startBlock;
        farmInfo.lpToken = _lpToken;
        farmInfo.lastRewardBlock = lastRewardBlock;
        farmInfo.accRewardPerShare = 0;

        farmInfo.endBlock = _endBlock;
        farmInfo.farmableSupply = _amount;
        farmInfo.withdrawlFeeBP = _withdrawlFeeBP;
        farmInfo.harvestInterval = _harvestInterval;
    }

    /**
     * @notice Gets the reward multiplier over the given _from_block until _to block
     * @param _from_block the start of the period to measure rewards for
     * @param _to the end of the period to measure rewards for
     * @return The weighted multiplier for the given period
     */

    function getMultiplier(uint256 _from_block, uint256 _to)
        public
        view
        returns (uint256)
    {
        uint256 _from =
            _from_block >= farmInfo.startBlock
                ? _from_block
                : farmInfo.startBlock;
        uint256 to = farmInfo.endBlock > _to ? _to : farmInfo.endBlock;
        if (to <= farmInfo.bonusEndBlock) {
            return to.sub(_from).mul(farmInfo.bonus);
        } else if (_from >= farmInfo.bonusEndBlock) {
            return to.sub(_from);
        } else {
            return
                farmInfo.bonusEndBlock.sub(_from).mul(farmInfo.bonus).add(
                    to.sub(farmInfo.bonusEndBlock)
                );
        }
    }

    /**
     * @notice function to see accumulated balance of reward token for specified user
     * @param _user the user for whom unclaimed tokens will be shown
     * @return total amount of withdrawable reward tokens
     */
    function pendingReward(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accRewardPerShare = farmInfo.accRewardPerShare;
        uint256 lpSupply = farmInfo.lpToken.balanceOf(address(this));
        if (block.number > farmInfo.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(farmInfo.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier.mul(farmInfo.blockReward);
            accRewardPerShare = accRewardPerShare.add(
                tokenReward.mul(1e12).div(lpSupply)
            );
        }

        uint256 pending =
            user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt);
        return pending.add(user.rewardLockedUp);
    }

    // View function to see if user can harvest cnt's.
    function canHarvest(address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // View function to see if user harvest until time.
    function getHarvestUntil(address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        return user.nextHarvestUntil;
    }

    /**
     * @notice updates pool information to be up to date to the current block
     */
    function updatePool() public {
        if (block.number <= farmInfo.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = farmInfo.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            farmInfo.lastRewardBlock = block.number < farmInfo.endBlock
                ? block.number
                : farmInfo.endBlock;
            return;
        }
        uint256 multiplier =
            getMultiplier(farmInfo.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier.mul(farmInfo.blockReward);
        farmInfo.accRewardPerShare = farmInfo.accRewardPerShare.add(
            tokenReward.mul(1e12).div(lpSupply)
        );
        farmInfo.lastRewardBlock = block.number < farmInfo.endBlock
            ? block.number
            : farmInfo.endBlock;
    }

    /**
     * @notice deposit LP token function for _msgSender()
     * @param _amount the total deposit amount
     */
    function deposit(uint256 _amount) public {
        UserInfo storage user = userInfo[_msgSender()];
        updatePool();
        payOrLockupPendingReward();

        if (user.amount == 0 && _amount > 0) {
            farmInfo.numFarmers++;
        }

        farmInfo.lpToken.safeTransferFrom(
            address(_msgSender()),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(farmInfo.accRewardPerShare).div(1e12);
        emit Deposit(_msgSender(), _amount);
    }

    /**
     * @notice withdraw LP token function for _msgSender()
     * @param _amount the total withdrawable amount
     */
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[_msgSender()];
        require(user.amount >= _amount, "INSUFFICIENT");
        updatePool();
        payOrLockupPendingReward();

        if (user.amount == _amount && _amount > 0) {
            farmInfo.numFarmers--;
        }

        user.amount = user.amount.sub(_amount);

        if (farmInfo.withdrawlFeeBP > 0) {
            uint256 withdrawlFee =
                _amount.mul(farmInfo.withdrawlFeeBP).div(10000);
            farmInfo.lpToken.safeTransfer(feeAddress, withdrawlFee);
            farmInfo.lpToken.safeTransfer(
                address(_msgSender()),
                _amount.sub(withdrawlFee)
            );
        } else {
            farmInfo.lpToken.safeTransfer(address(_msgSender()), _amount);
        }
        user.rewardDebt = user.amount.mul(farmInfo.accRewardPerShare).div(1e12);
        emit Withdraw(_msgSender(), _amount);
    }

    /**
     * @notice emergency functoin to withdraw LP tokens and forego harvest rewards. Important to protect users LP tokens
     */
    function emergencyWithdraw() public {
        UserInfo storage user = userInfo[_msgSender()];
        farmInfo.lpToken.safeTransfer(address(_msgSender()), user.amount);
        emit EmergencyWithdraw(_msgSender(), user.amount);
        if (user.amount > 0) {
            farmInfo.numFarmers--;
        }
        user.amount = 0;
        user.rewardDebt = 0;
    }

    function payOrLockupPendingReward() internal {
        UserInfo storage user = userInfo[_msgSender()];

        if (user.nextHarvestUntil == 0) {
            user.nextHarvestUntil = block.timestamp.add(
                farmInfo.harvestInterval
            );
        }

        uint256 pending =
            user.amount.mul(farmInfo.accRewardPerShare).div(1e12).sub(
                user.rewardDebt
            );
        if (canHarvest(_msgSender())) {
            if (pending > 0 || user.rewardLockedUp > 0) {
                uint256 totalRewards = pending.add(user.rewardLockedUp);

                // reset lockup
                totalLockedUpRewards = totalLockedUpRewards.sub(
                    user.rewardLockedUp
                );
                user.rewardLockedUp = 0;
                user.nextHarvestUntil = block.timestamp.add(
                    farmInfo.harvestInterval
                );

                // send rewards
                _safeRewardTransfer(_msgSender(), totalRewards);
            }
        } else if (pending > 0) {
            user.rewardLockedUp = user.rewardLockedUp.add(pending);
            totalLockedUpRewards = totalLockedUpRewards.add(pending);
            emit RewardLockedUp(_msgSender(), pending);
        }
    }

    // Update fee address by the previous fee address.
    function setFeeAddress(address _feeAddress) public onlyOwner {
        require(_feeAddress != address(0), "setFeeAddress: invalid address");
        feeAddress = _feeAddress;
    }

    /**
     * @notice Safe reward transfer function, just in case a rounding error causes pool to not have enough reward tokens
     * @param _to the user address to transfer tokens to
     * @param _amount the total amount of tokens to transfer
     */
    function _safeRewardTransfer(address _to, uint256 _amount) internal {
        uint256 rewardBal = farmInfo.rewardToken.balanceOf(address(this));
        if (_amount > rewardBal) {
            farmInfo.rewardToken.transfer(_to, rewardBal);
        } else {
            farmInfo.rewardToken.transfer(_to, _amount);
        }
    }
}
