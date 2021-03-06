// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../libraries/TransferHelper.sol";
import "../libraries/NativeMetaTransaction.sol";
import "../libraries/ContextMixin.sol";
import "../polydex/interfaces/IPolydexPair.sol";
import "../polydex/interfaces/IRewardManager.sol";
import "../polydex/interfaces/ILiquidityManager.sol";

contract StakingPoolWithLiquidityManager is
    Ownable,
    ContextMixin,
    NativeMetaTransaction,
    ReentrancyGuard
{
    using SafeMath for uint256;
    using SafeMath for uint16;
    using SafeERC20 for IERC20;

    /// @notice information stuct on each user than stakes LP tokens.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 nextHarvestUntil; // When can the user harvest again.
        mapping(IERC20 => uint256) rewardDebt; // Reward debt.
        mapping(IERC20 => uint256) rewardLockedUp; // Reward locked up.
        mapping(address => bool) whiteListedHandlers;
    }

    // Info of each pool.
    struct RewardInfo {
        uint256 accRewardPerShare;
        uint256 lastRewardBlock; // Last block number that rewards distribution occurs.
        uint256 blockReward;
        IERC20 rewardToken; // Address of reward token contract.
    }

    /// @notice all the settings for this farm in one struct
    struct FarmInfo {
        uint256 startBlock;
        uint256 endBlock;
        uint256 numFarmers;
        uint256 harvestInterval; // Harvest interval in seconds
        IERC20 inputToken;
        uint16 withdrawalFeeBP; // Deposit fee in basis points
        uint16 depositFeeBP; // Deposit fee in basis points
    }

    // Deposit Fee address
    address public feeAddress;
    // Max harvest interval: 14 days.
    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days;

    // Max withdrawal fee: 10%. This number is later divided by 10000 for calculations.
    uint16 public constant MAXIMUM_WITHDRAWAL_FEE_BP = 1000;

    // Max deposit fee: 10%. This number is later divided by 10000 for calculations.
    uint16 public constant MAXIMUM_DEPOSIT_FEE_BP = 1000;

    uint256 public totalInputTokensStaked = 0;

    // Total locked up rewards
    mapping(IERC20 => uint256) public totalLockedUpRewards;

    FarmInfo public farmInfo;

    mapping(address => bool) public activeRewardTokens;

    /// @notice information on each user than stakes LP tokens
    mapping(address => UserInfo) public userInfo;

    RewardInfo[] public rewardPool;

    bool public isInitiated;

    //Trigger for RewardManager mode
    bool public isRewardManagerEnabled;

    address public rewardManager;

    //Trigger for LiquidityManager mode
    bool public isLiquidityManagerEnabled;

    address public liquidityManager;

    IERC20 public CNT;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardLockedUp(address indexed user, uint256 amountLockedUp);
    event RewardTokenAdded(IERC20 _rewardToken);
    event UserWhitelisted(address _primaryUser, address _whitelistedUser);
    event UserBlacklisted(address _primaryUser, address _blacklistedUser);
    event BlockRewardUpdated(uint256 _blockReward, uint256 _rewardPoolIndex);

    constructor(address _feeAddress, IERC20 _CNT) {
        _initializeEIP712("StakingPool");
        feeAddress = _feeAddress;
        isRewardManagerEnabled = false;
        rewardManager = address(0);
        isLiquidityManagerEnabled = false;
        liquidityManager = address(0);
        CNT = _CNT;
    }

    function _msgSender()
        internal
        view
        override
        returns (address payable sender)
    {
        return ContextMixin.msgSender();
    }

    function updateRewardManagerMode(bool _isRewardManagerEnabled)
        external
        onlyOwner
    {
        massUpdatePools();
        isRewardManagerEnabled = _isRewardManagerEnabled;
    }

    function updateRewardManager(address _rewardManager) external onlyOwner {
        require(_rewardManager != address(0), "Reward Manager address is zero");
        massUpdatePools();
        rewardManager = _rewardManager;
    }

    function updateLiquidityManagerMode(bool _isLiquidityManagerEnabled)
        external
        onlyOwner
    {
        massUpdatePools();
        isLiquidityManagerEnabled = _isLiquidityManagerEnabled;
    }

    function updateLiquidityManager(address _liquidityManager)
        external
        onlyOwner
    {
        require(
            _liquidityManager != address(0),
            "Liquidity Manager address is zero"
        );
        massUpdatePools();
        liquidityManager = _liquidityManager;
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
        uint16 _depositFeeBP,
        uint256 _harvestInterval
    ) external onlyOwner {
        require(!isInitiated, "Staking pool is already initiated");

        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
            "add: invalid deposit fee basis points"
        );
        require(
            _depositFeeBP <= MAXIMUM_DEPOSIT_FEE_BP,
            "add: invalid deposit fee basis points"
        );
        require(
            _harvestInterval <= MAXIMUM_HARVEST_INTERVAL,
            "add: invalid harvest interval"
        );

        isInitiated = true;

        TransferHelper.safeTransferFrom(
            address(_rewardToken),
            _msgSender(),
            address(this),
            _amount
        );

        farmInfo.startBlock = _startBlock;

        uint256 lastRewardBlock = block.number > _startBlock
            ? block.number
            : _startBlock;
        farmInfo.inputToken = _inputToken;

        farmInfo.endBlock = _endBlock;

        rewardPool.push(
            RewardInfo({
                rewardToken: _rewardToken,
                lastRewardBlock: lastRewardBlock,
                blockReward: _blockReward,
                accRewardPerShare: 0
            })
        );

        farmInfo.withdrawalFeeBP = _withdrawalFeeBP;
        farmInfo.depositFeeBP = _depositFeeBP;
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
        uint256 _from = _fromBlock >= farmInfo.startBlock
            ? _fromBlock
            : farmInfo.startBlock;
        uint256 to = farmInfo.endBlock > _to ? _to : farmInfo.endBlock;
        if (_from > to) {
            return 0;
        }

        return to.sub(_from, "from getMultiplier");
    }

    function addRewardToken(
        IERC20 _rewardToken, // Address of reward token contract.
        uint256 _lastRewardBlock,
        uint256 _blockReward,
        uint256 _amount
    ) external onlyOwner nonReentrant {
        require(address(_rewardToken) != address(0), "Invalid reward token");
        require(
            activeRewardTokens[address(_rewardToken)] == false,
            "Reward Token already added"
        );

        require(
            _lastRewardBlock >= block.number,
            "Last reward block must be greater current block number"
        );

        rewardPool.push(
            RewardInfo({
                rewardToken: _rewardToken,
                lastRewardBlock: _lastRewardBlock,
                blockReward: _blockReward,
                accRewardPerShare: 0
            })
        );

        activeRewardTokens[address(_rewardToken)] = true;

        TransferHelper.safeTransferFrom(
            address(_rewardToken),
            msg.sender,
            address(this),
            _amount
        );

        emit RewardTokenAdded(_rewardToken);
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
        uint256 lpSupply = totalInputTokensStaked;

        if (block.number > rewardInfo.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(
                rewardInfo.lastRewardBlock,
                block.number
            );
            uint256 tokenReward = multiplier.mul(rewardInfo.blockReward);
            accRewardPerShare = accRewardPerShare.add(
                tokenReward.mul(1e12).div(lpSupply)
            );
        }

        uint256 pending = user.amount.mul(accRewardPerShare).div(1e12).sub(
            user.rewardDebt[rewardInfo.rewardToken]
        );
        return pending.add(user.rewardLockedUp[rewardInfo.rewardToken]);
    }

    // View function to see if user can harvest cnt's.
    function canHarvest(address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // View function to see if user harvest until time.
    function getHarvestUntil(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
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
        uint256 lpSupply = totalInputTokensStaked;

        if (lpSupply == 0) {
            rewardInfo.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(
            rewardInfo.lastRewardBlock,
            block.number
        );
        uint256 tokenReward = multiplier.mul(rewardInfo.blockReward);
        rewardInfo.accRewardPerShare = rewardInfo.accRewardPerShare.add(
            tokenReward.mul(1e12).div(lpSupply)
        );
        rewardInfo.lastRewardBlock = block.number < farmInfo.endBlock
            ? block.number
            : farmInfo.endBlock;
    }

    function massUpdatePools() public {
        for (uint256 i = 0; i < rewardPool.length; i++) {
            updatePool(i);
        }
    }

    /**
     * @notice deposit LP token function for _msgSender()
     * @param _amount the total deposit amount
     */

    function depositWithPermit(
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        uint256 value = uint256(-1);
        IPolydexPair(address(farmInfo.inputToken)).permit(
            _msgSender(),
            address(this),
            value,
            _deadline,
            _v,
            _r,
            _s
        );
        _deposit(_amount, _msgSender());
    }

    function depositForWithPermit(
        uint256 _amount,
        address _user,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        uint256 value = uint256(-1);
        IPolydexPair(address(farmInfo.inputToken)).permit(
            _msgSender(),
            address(this),
            value,
            _deadline,
            _v,
            _r,
            _s
        );
        _deposit(_amount, _user);
    }

    function deposit(uint256 _amount) external nonReentrant {
        _deposit(_amount, _msgSender());
    }

    function depositFor(uint256 _amount, address _user) external nonReentrant {
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
            uint256 depositFee;
            if (farmInfo.depositFeeBP > 0) {
                depositFee = _amount.mul(farmInfo.depositFeeBP).div(10000);
                farmInfo.inputToken.safeTransfer(feeAddress, depositFee);
            }
            uint256 depositedAmount;
            if (isLiquidityManagerEnabled) {
                IERC20(farmInfo.inputToken).approve(
                    liquidityManager,
                    _amount.sub(depositFee)
                );
                depositedAmount = ILiquidityManager(liquidityManager)
                    .handleDeposit(
                        address(farmInfo.inputToken),
                        _amount.sub(depositFee),
                        _user
                    );
            } else {
                depositedAmount = _amount.sub(depositFee);
            }
            user.amount = user.amount.add(depositedAmount);
            totalInputTokensStaked = totalInputTokensStaked.add(
                depositedAmount
            );
        } else {
            _transferPendingStrategyRewards(_user);
        }
        updateRewardDebt(_user);
        emit Deposit(_user, _amount);
    }

    /**
     * @notice get withdrawable amount once rescue funds have been called from strategy
     * @param _amount the amount to process for
     */
    function _getWithdrawableAmount(uint256 _amount)
        internal
        view
        returns (uint256 withdrawableAmount)
    {
        uint256 totalAssetAmount = farmInfo.inputToken.balanceOf(address(this));
        withdrawableAmount = _amount.mul(totalAssetAmount).div(
            totalInputTokensStaked
        );
    }

    /**
     * @notice withdraw LP token function for _msgSender()
     * @param _amount the total withdrawable amount
     */
    function withdraw(uint256 _amount) external nonReentrant {
        _withdraw(_amount, _msgSender(), _msgSender());
    }

    function withdrawFor(uint256 _amount, address _user) external nonReentrant {
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
            uint256 withdrawnAmount;
            if (isLiquidityManagerEnabled) {
                withdrawnAmount = ILiquidityManager(liquidityManager)
                    .handleWithdraw(
                        address(farmInfo.inputToken),
                        _amount,
                        _user
                    );
            } else {
                withdrawnAmount = _getWithdrawableAmount(_amount);
            }
            if (farmInfo.withdrawalFeeBP > 0) {
                uint256 withdrawalFee = (withdrawnAmount)
                    .mul(farmInfo.withdrawalFeeBP)
                    .div(10000);
                farmInfo.inputToken.safeTransfer(feeAddress, withdrawalFee);
                farmInfo.inputToken.safeTransfer(
                    address(_withdrawer),
                    withdrawnAmount.sub(withdrawalFee)
                );
            } else {
                farmInfo.inputToken.safeTransfer(
                    address(_withdrawer),
                    withdrawnAmount
                );
            }
        } else {
            _transferPendingStrategyRewards(_user);
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
        updateRewardDebt(_user);
        emit Withdraw(_user, _amount);
    }

    /**
     * @notice emergency function to withdraw LP tokens and forego harvest rewards. Important to protect users LP tokens
     */
    function emergencyWithdraw() external nonReentrant {
        UserInfo storage user = userInfo[_msgSender()];
        uint256 withdrawnAmount;
        if (isLiquidityManagerEnabled) {
            withdrawnAmount = ILiquidityManager(liquidityManager)
                .handleWithdraw(
                    address(farmInfo.inputToken),
                    user.amount,
                    msg.sender
                );
        } else {
            withdrawnAmount = _getWithdrawableAmount(user.amount);
        }
        farmInfo.inputToken.safeTransfer(
            address(_msgSender()),
            withdrawnAmount
        );
        emit EmergencyWithdraw(_msgSender(), user.amount);
        if (user.amount > 0) {
            farmInfo.numFarmers--;
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(user.amount);
        user.amount = 0;

        for (uint256 i = 0; i < rewardPool.length; i++) {
            user.rewardDebt[rewardPool[i].rewardToken] = 0;
        }
    }

    function whitelistHandler(address _handler) external {
        UserInfo storage user = userInfo[_msgSender()];
        user.whiteListedHandlers[_handler] = true;
        emit UserWhitelisted(_msgSender(), _handler);
    }

    function removeWhitelistedHandler(address _handler) external {
        UserInfo storage user = userInfo[_msgSender()];
        user.whiteListedHandlers[_handler] = false;
        emit UserBlacklisted(_msgSender(), _handler);
    }

    function isUserWhiteListed(address _owner, address _user)
        external
        view
        returns (bool)
    {
        UserInfo storage user = userInfo[_owner];
        return user.whiteListedHandlers[_user];
    }

    function _transferPendingStrategyRewards(address _user) internal {
        if (isLiquidityManagerEnabled) {
            ILiquidityManager(liquidityManager).handleDeposit(
                address(farmInfo.inputToken),
                0,
                _user
            );
        }
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
            uint256 userRewardLockedUp = user.rewardLockedUp[
                rewardInfo.rewardToken
            ];
            uint256 pending = user
                .amount
                .mul(rewardInfo.accRewardPerShare)
                .div(1e12)
                .sub(userRewardDebt);
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
                    if (
                        isRewardManagerEnabled == true &&
                        address(rewardInfo.rewardToken) == address(CNT)
                    ) {
                        _safeRewardTransfer(
                            rewardManager,
                            totalRewards,
                            rewardInfo.rewardToken
                        );
                        IRewardManager(rewardManager).handleRewardsForUser(
                            _withdrawer,
                            totalRewards,
                            block.timestamp,
                            0,
                            user.rewardDebt[rewardInfo.rewardToken]
                        );
                    } else {
                        // send rewards
                        _safeRewardTransfer(
                            _withdrawer,
                            totalRewards,
                            rewardInfo.rewardToken
                        );
                    }
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
        }
    }

    function updateRewardDebt(address _user) internal {
        UserInfo storage user = userInfo[_user];
        for (uint256 i = 0; i < rewardPool.length; i++) {
            RewardInfo storage rewardInfo = rewardPool[i];

            user.rewardDebt[rewardInfo.rewardToken] = user
                .amount
                .mul(rewardInfo.accRewardPerShare)
                .div(1e12);
        }
    }

    // Update fee address by the previous fee address.
    function setFeeAddress(address _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "setFeeAddress: invalid address");
        feeAddress = _feeAddress;
    }

    function changeWithdrawalFee(uint16 _withdrawalFeeBP) external onlyOwner {
        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
            "add: invalid withdrawal fee basis points"
        );
        farmInfo.withdrawalFeeBP = _withdrawalFeeBP;
    }

    function changeDepositFee(uint16 _depositFeeBP) external onlyOwner {
        require(
            _depositFeeBP <= MAXIMUM_DEPOSIT_FEE_BP,
            "add: invalid deposit fee basis points"
        );
        farmInfo.depositFeeBP = _depositFeeBP;
    }

    function changeFarmHarvestInterval(uint256 _harvestInterval)
        external
        onlyOwner
    {
        require(
            _harvestInterval <= MAXIMUM_HARVEST_INTERVAL,
            "add: invalid harvest interval"
        );
        massUpdatePools();
        farmInfo.harvestInterval = _harvestInterval;
    }

    // Function to update the end block for owner. To control the distribution duration.
    function updateEndBlock(uint256 _endBlock) external onlyOwner {
        farmInfo.endBlock = _endBlock;
    }

    function updateBlockReward(uint256 _blockReward, uint256 _rewardTokenIndex)
        external
        onlyOwner
    {
        updatePool(_rewardTokenIndex);
        rewardPool[_rewardTokenIndex].blockReward = _blockReward;
        emit BlockRewardUpdated(_blockReward, _rewardTokenIndex);
    }

    function transferRewardToken(uint256 _rewardTokenIndex, uint256 _amount)
        external
        onlyOwner
    {
        RewardInfo storage rewardInfo = rewardPool[_rewardTokenIndex];

        rewardInfo.rewardToken.transfer(msg.sender, _amount);
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
        _rewardToken.transfer(_to, _amount);
    }
}
