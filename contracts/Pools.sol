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
        mapping(IERC20 => uint256) rewardDebt; // Reward debt.
        mapping(IERC20 => uint256) rewardLockedUp; // Reward locked up.
        uint256 nextHarvestUntil; // When can the user harvest again.
        mapping(address => bool) whiteListedHandlers;
    }

    // Info of each pool.
    struct RewardInfo {
        IERC20 rewardToken; // Address of reward token contract.
        uint256 accRewardPerShare;
        uint256 lastRewardBlock; // Last block number that rewards distribution occurs.
        uint256 blockReward;
    }

    /// @notice all the settings for this farm in one struct
    struct FarmInfo {
        IERC20 inputToken;
        uint256 startBlock;
        uint256 endBlock;
        uint256 numFarmers;
        uint16 withdrawalFeeBP; // Deposit fee in basis points
        uint256 harvestInterval; // Harvest interval in seconds
    }

    // Deposit Fee address
    address public feeAddress;
    // Max harvest interval: 14 days.
    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days;

    // Max deposit fee: 10%. This number is later divided by 10000 for calculations.
    uint16 public constant MAXIMUM_WITHDRAWAL_FEE_BP = 1000;

    uint256 totalInputTokensStaked = 0;

    // Total locked up rewards
    mapping(IERC20 => uint256) public totalLockedUpRewards;

    FarmInfo public farmInfo;

    mapping(address => bool) public activeRewardTokens;

    /// @notice information on each user than stakes LP tokens
    mapping(address => UserInfo) public userInfo;

    RewardInfo[] public rewardPool;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardLockedUp(address indexed user, uint256 amountLockedUp);
    event RewardTokenAdded(IERC20 _rewardToken);

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
        IERC20 _inputToken,
        uint256 _blockReward,
        uint256 _startBlock,
        uint256 _endBlock,
        uint16 _withdrawalFeeBP,
        uint256 _harvestInterval
    ) external onlyOwner {
        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
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

        farmInfo.startBlock = _startBlock;

        uint256 lastRewardBlock =
            block.number > _startBlock ? block.number : _startBlock;
        farmInfo.inputToken = _inputToken;

        farmInfo.endBlock = _endBlock;

        rewardPool.push(
            RewardInfo({
                rewardToken: _rewardToken,
                lastRewardBlock: block.number > _startBlock
                    ? block.number
                    : _startBlock,
                blockReward: _blockReward,
                accRewardPerShare: 0
            })
        );

        farmInfo.withdrawalFeeBP = _withdrawalFeeBP;
        farmInfo.harvestInterval = _harvestInterval;

        activeRewardTokens[address(_rewardToken)] = true;
    }

    /**
     * @notice Gets the reward multiplier over the given _from_block until _to block
     * @param _fromBlock the start of the period to measure rewards for
     * @param _to the end of the period to measure rewards for
     * @return The weighted multiplier for the given period
     */
    function getMultiplier(uint256 _fromBlock, uint256 _to)
        public
        view
        returns (uint256)
    {
        uint256 _from =
            _fromBlock >= farmInfo.startBlock
                ? _fromBlock
                : farmInfo.startBlock;
        uint256 to = farmInfo.endBlock > _to ? _to : farmInfo.endBlock;
        return to.sub(_from, "from getMultiplier");
    }

    /**
     * @notice function to see accumulated balance of reward token for specified user
     * @param _user the user for whom unclaimed tokens will be shown
     * @return total amount of withdrawable reward tokens
     */
    function pendingReward(address _user, uint256 _rewardInfoIndex)
        external
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_user];
        RewardInfo memory rewardInfo = rewardPool[_rewardInfoIndex];
        uint256 accRewardPerShare = rewardInfo.accRewardPerShare;
        uint256 lpSupply = 0;
        if (
            address(farmInfo.inputToken) == address(rewardInfo.rewardToken)
        ) {
            // totalStaked
            lpSupply = totalInputTokensStaked;
        } else {
            lpSupply = farmInfo.inputToken.balanceOf(address(this));
        }
        if (block.number > rewardInfo.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(rewardInfo.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier.mul(rewardInfo.blockReward);
            accRewardPerShare = accRewardPerShare.add(
                tokenReward.mul(1e12).div(lpSupply)
            );
        }

        uint256 pending =
            user.amount.mul(accRewardPerShare).div(1e12).sub(
                user.rewardDebt[rewardInfo.rewardToken]
            );
        return pending.add(user.rewardLockedUp[rewardInfo.rewardToken]);
    }

    // View function to see if user can harvest cnt's.
    function canHarvest(address _user) public view returns (bool) {
        UserInfo memory user = userInfo[_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // View function to see if user harvest until time.
    function getHarvestUntil(address _user) public view returns (uint256) {
        UserInfo memory user = userInfo[_user];
        return user.nextHarvestUntil;
    }

    /**
     * @notice updates pool information to be up to date to the current block
     */
    function updatePool(uint256 _rewardInfoIndex) public {
        RewardInfo storage rewardInfo = rewardPool[_rewardInfoIndex];
        if (block.number <= rewardInfo.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = 0;

        if (
            address(farmInfo.inputToken) == address(rewardInfo.rewardToken)
        ) {
            // totalStaked
            lpSupply = totalInputTokensStaked
        } else {
            lpSupply = farmInfo.inputToken.balanceOf(address(this));
        }

        if (lpSupply == 0) {
            rewardInfo.lastRewardBlock = block.number < farmInfo.endBlock
                ? block.number
                : farmInfo.endBlock;
            return;
        }
        uint256 multiplier =
            getMultiplier(rewardInfo.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier.mul(rewardInfo.blockReward);
        rewardInfo.accRewardPerShare = rewardInfo.accRewardPerShare.add(
            tokenReward.mul(1e12).div(lpSupply)
        );
        rewardInfo.lastRewardBlock = block.number < farmInfo.endBlock
            ? block.number
            : farmInfo.endBlock;
    }

    /**
     * @notice deposit LP token function for _msgSender()
     * @param _amount the total deposit amount
     */
    function deposit(uint256 _amount) public {
        _deposit(_amount, _msgSender());
    }

    function depositFor(uint256 _amount, address _user) public {
        _deposit(_amount, _user);
    }

    function _deposit(uint256 _amount, address _user) internal {
        UserInfo storage user = userInfo[_user];
        user.whiteListedHandlers[_user] = true;
        payOrLockupPendingReward(_user, _user);
        if (user.amount == 0 && _amount > 0) {
            farmInfo.numFarmers++;
        }
        if (_amount > 0) {
            farmInfo.inputToken.safeTransferFrom(
                address(_msgSender()),
                address(this),
                _amount
            );
            user.amount = user.amount.add(_amount);
        if (
            address(farmInfo.inputToken) == address(rewardInfo.rewardToken)
        ) {
            // totalStaked
            totalInputTokensStaked = totalInputTokensStaked.add(_amount);
        }
        }
        emit Deposit(_user, _amount);
    }

    /**
     * @notice withdraw LP token function for _msgSender()
     * @param _amount the total withdrawable amount
     */
    function withdraw(uint256 _amount) public {
        _withdraw(_amount, _msgSender(), _msgSender());
    }

    function withdrawFor(uint256 _amount, address _user) public {
        UserInfo storage user = userInfo[_user];
        require(
            user.whiteListedHandlers[_msgSender()],
            "Handler not whitelisted to withdraw"
        );
        _withdraw(_amount, _user, _msgSender());
    }

    function _withdraw(
        uint256 _amount,
        address _user,
        address _withdrawer
    ) internal {
        UserInfo storage user = userInfo[_user];
        require(user.amount >= _amount, "INSUFFICIENT");
        payOrLockupPendingReward(_user, _withdrawer);
        if (user.amount == _amount && _amount > 0) {
            farmInfo.numFarmers--;
        }

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            if (farmInfo.withdrawalFeeBP > 0) {
                uint256 withdrawalFee =
                    _amount.mul(farmInfo.withdrawalFeeBP).div(10000);
                farmInfo.inputToken.safeTransfer(feeAddress, withdrawalFee);
                farmInfo.inputToken.safeTransfer(
                    address(_withdrawer),
                    _amount.sub(withdrawalFee)
                );
            } else {
                farmInfo.inputToken.safeTransfer(address(_withdrawer), _amount);
            }

            if (
                address(farmInfo.inputToken) == address(rewardInfo.rewardToken)
            ) {
            // totalStaked
            totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
            }
        }
        emit Withdraw(_user, _amount);
    }

    /**
     * @notice emergency function to withdraw LP tokens and forego harvest rewards. Important to protect users LP tokens
     */
    function emergencyWithdraw() public {
        UserInfo storage user = userInfo[_msgSender()];
        farmInfo.inputToken.safeTransfer(address(_msgSender()), user.amount);
        emit EmergencyWithdraw(_msgSender(), user.amount);
        if (user.amount > 0) {
            farmInfo.numFarmers--;
        }
        user.amount = 0;

        for (uint256 i = 0; i < rewardPool.length; i++) {
            user.rewardDebt[rewardPool[i].rewardToken] = 0;
        }
    }

    function whitelistHandler(address _handler) external {
        UserInfo storage user = userInfo[_msgSender()];
        user.whiteListedHandlers[_handler] = true;
    }

    function removeWhitelistedHandler(address _handler) external {
        UserInfo storage user = userInfo[_msgSender()];
        user.whiteListedHandlers[_handler] = false;
    }

    function isUserWhiteListed(address _owner, address _user)
        public
        view
        returns (bool)
    {
        UserInfo storage user = userInfo[_owner];
        return user.whiteListedHandlers[_user];
    }

    function payOrLockupPendingReward(address _user, address _withdrawer)
        internal
    {
        UserInfo storage user = userInfo[_user];

        if (user.nextHarvestUntil == 0) {
            user.nextHarvestUntil = block.timestamp.add(
                farmInfo.harvestInterval
            );
        }

        bool canUserHarvest = canHarvest(_user);

        for (uint256 i = 0; i < rewardPool.length; i++) {
            RewardInfo storage rewardInfo = rewardPool[i];

            updatePool(i);

            uint256 userRewardDebt = user.rewardDebt[rewardInfo.rewardToken];
            uint256 userRewardLockedUp =
                user.rewardLockedUp[rewardInfo.rewardToken];
            uint256 pending =
                user.amount.mul(rewardInfo.accRewardPerShare).div(1e12).sub(
                    userRewardDebt
                );

            if (canUserHarvest) {
                if (pending > 0 || userRewardLockedUp > 0) {
                    uint256 totalRewards = pending.add(userRewardLockedUp);

                    // reset lockup
                    totalLockedUpRewards[
                        rewardInfo.rewardToken
                    ] = totalLockedUpRewards[rewardInfo.rewardToken].sub(
                        userRewardLockedUp
                    );
                    user.rewardLockedUp[rewardInfo.rewardToken] = 0;
                    user.nextHarvestUntil = block.timestamp.add(
                        farmInfo.harvestInterval
                    );

                    // send rewards
                    _safeRewardTransfer(
                        _withdrawer,
                        totalRewards,
                        rewardInfo.rewardToken
                    );
                }
            } else if (pending > 0) {
                user.rewardLockedUp[rewardInfo.rewardToken] = user
                    .rewardLockedUp[rewardInfo.rewardToken]
                    .add(pending);
                totalLockedUpRewards[
                    rewardInfo.rewardToken
                ] = totalLockedUpRewards[rewardInfo.rewardToken].add(pending);
                emit RewardLockedUp(_user, pending);
            }

            user.rewardDebt[rewardInfo.rewardToken] = user
                .amount
                .mul(rewardInfo.accRewardPerShare)
                .div(1e12);
        }
    }

    // Update fee address by the previous fee address.
    function setFeeAddress(address _feeAddress) public onlyOwner {
        require(_feeAddress != address(0), "setFeeAddress: invalid address");
        feeAddress = _feeAddress;
    }

    // Function to update the end block for owner. To control the distribution duration.
    function updateEndBlock(uint256 _endBlock) public onlyOwner {
        farmInfo.endBlock = _endBlock;
    }

    function updateBlockReward(uint256 _blockReward, uint256 _rewardTokenIndex)
        public
        onlyOwner
    {
        updatePool(_rewardTokenIndex);
        rewardPool[_rewardTokenIndex].blockReward = _blockReward;
    }

    /**
     * @notice Safe reward transfer function, just in case a rounding error causes pool to not have enough reward tokens
     * @param _amount the total amount of tokens to transfer
     * @param _rewardToken token address for transferring tokens
     */
    function _safeRewardTransfer(
        address _to,
        uint256 _amount,
        IERC20 _rewardToken
    ) private {
        uint256 rewardBal = _rewardToken.balanceOf(address(this));
        if (_amount > rewardBal) {
            _rewardToken.transfer(_to, rewardBal);
        } else {
            _rewardToken.transfer(_to, _amount);
        }
    }
}
