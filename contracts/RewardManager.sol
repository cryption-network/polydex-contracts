// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RewardManager is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public bonusRewardsPool;

    address public rewardManagerFactory;

    // Call from excludedAddresses will be whitelisted & rewards harvested from farm will not be vested
    mapping(address => bool) public excludedAddresses;

    // preMaturePenalty will be sent to burner address
    address public l2Burner;

    //Upfront rewards unlock in percentage. This number is later divided by 1000 for calculations.
    uint256 public upfrontUnlock;

    //Pre mature penalty in percentage. This number is later divided by 1000 for calculations.
    uint256 public preMaturePenalty;

    //Bonus Rewards in percentage. This number is later divided by 1000 for calculations.
    uint256 public bonusPercentage;

    /// @notice start of Distribution phase as a timestamp
    uint256 public startDistribution;

    /// @notice end of Distribution phase as a timestamp
    uint256 public endDistribution;

    //Cryption Network Token (cnt) token address
    IERC20 public cnt;

    /// @notice amount vested for a user.
    mapping(address => uint256) public vestedAmount;

    /// @notice cumulative total of tokens drawn down (and transferred from the deposit account) per beneficiary
    mapping(address => uint256) public totalDrawn;

    /// @notice last drawn down time (seconds) per beneficiary
    mapping(address => uint256) public lastDrawnAt;

    /// @notice total tokens burnt per beneficiary
    mapping(address => uint256) public burntAmount;

    /// @notice bonus rewards entitled per beneficiary
    mapping(address => uint256) public bonusReward;

    /// @notice event emitted when a vesting schedule is created
    event Vested(address indexed _beneficiary, uint256 indexed value);

    /// @notice event emitted when a successful drawn down of vesting tokens is made
    event DrawDown(
        address indexed _beneficiary,
        uint256 indexed _amount,
        uint256 indexed bonus
    );

    /// @notice event emitted when a successful pre mature drawn down of vesting tokens is made
    event PreMatureDrawn(
        address indexed _beneficiary,
        uint256 indexed burntAmount,
        uint256 indexed userEffectiveWithdrawn
    );

    modifier checkPercentages(uint256 _percentage) {
        require(_percentage <= 1000, "Invalid Percentages");
        _;
    }

    modifier checkTime(uint256 _startDistribution, uint256 _endDistribution) {
        require(
            _endDistribution > _startDistribution,
            "end time should be greater than start"
        );
        _;
    }

    /**
     * @notice Construct a new Reward Manager contract
     * @param _cnt cnt token address
     * @param _startDistribution start timestamp
     * @param _endDistribution end timestamp
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _bonusPercentage Bonus rewards percentage for user who hasn't drawn any rewards untill endDistribution
     * @param _burner Burner for collecting preMaturePenalty
     * @dev deployer of contract on constructor is set as owner
     */
    constructor(
        IERC20 _cnt,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage,
        address _burner
    ) checkTime(_startDistribution, _endDistribution) {
        cnt = _cnt;
        startDistribution = _startDistribution;
        endDistribution = _endDistribution;
        upfrontUnlock = _upfrontUnlock;
        preMaturePenalty = _preMaturePenalty;
        bonusPercentage = _bonusPercentage;
        l2Burner = _burner;
        rewardManagerFactory = owner();
    }

    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }

    function updatePreMaturePenalty(uint256 _newpreMaturePenalty)
        external
        checkPercentages(_newpreMaturePenalty)
        onlyOwner
    {
        preMaturePenalty = _newpreMaturePenalty;
    }

    function updateBonusPercentage(uint256 _newBonusPercentage)
        external
        checkPercentages(_newBonusPercentage)
        onlyOwner
    {
        bonusPercentage = _newBonusPercentage;
    }

    function updateDistributionTime(
        uint256 _updatedStartTime,
        uint256 _updatedEndTime
    ) external checkTime(_updatedStartTime, _updatedEndTime) onlyOwner {
        require(
            startDistribution > _getNow(),
            "Vesting already started can't update now"
        );
        startDistribution = _updatedStartTime;
        endDistribution = _updatedEndTime;
    }

    function updateUpfrontUnlock(uint256 _newUpfrontUnlock)
        external
        checkPercentages(_newUpfrontUnlock)
        onlyOwner
    {
        upfrontUnlock = _newUpfrontUnlock;
    }

    function updateWhitelistAddress(address _excludeAddress, bool status)
        external
        onlyOwner
    {
        excludedAddresses[_excludeAddress] = status;
    }

    function handleRewardsForUser(
        address user,
        uint256 rewardAmount,
        uint256 timestamp,
        uint256 pid,
        uint256 rewardDebt
    ) external onlyOwner {
        if (rewardAmount > 0) {
            if (excludedAddresses[user]) {
                cnt.safeTransfer(user, rewardAmount);
            } else {
                uint256 upfrontAmount = rewardAmount.mul(upfrontUnlock).div(
                    1000
                );
                cnt.safeTransfer(user, upfrontAmount);
                _vest(user, rewardAmount.sub(upfrontAmount));
            }
        }
    }

    function _vest(address _user, uint256 _amount) internal {
        require(
            _getNow() < startDistribution,
            "Cannot vest in distribution phase"
        );
        require(_user != address(0), "Cannot vest for Zero address");

        vestedAmount[_user] = vestedAmount[_user].add(_amount);

        emit Vested(_user, _amount);
    }

    /**
     * @notice Vesting schedule data associated for a user
     * @dev Must be called directly by the beneficiary assigned the tokens in the schedule
     * @return totalVested Total vested amount for user
     * @return totalDrawnAmount total token drawn by user
     * @return amountBurnt total amount burnt while pre maturely drawing
     * @return claimable token available to be claimed
     * @return bonusRewards tokens a user will get if nothing has been withdrawn untill endDistribution
     * @return stillDue tokens still due (and currently locked) from vesting schedule
     */
    function vestingInfo(address _user)
        public
        view
        returns (
            uint256 totalVested,
            uint256 totalDrawnAmount,
            uint256 amountBurnt,
            uint256 claimable,
            uint256 bonusRewards,
            uint256 stillDue
        )
    {
        return (
            vestedAmount[_user],
            totalDrawn[_user],
            burntAmount[_user],
            _availableDrawDownAmount(_user),
            bonusReward[_user],
            _remainingBalance(_user)
        );
    }

    function _availableDrawDownAmount(address _user)
        internal
        view
        returns (uint256)
    {
        uint256 currentTime = _getNow();
        if (
            currentTime < startDistribution ||
            totalDrawn[_user] == vestedAmount[_user]
        ) {
            return 0;
        } else if (currentTime >= endDistribution) {
            return _remainingBalance(_user);
        } else {
            // Work out when the last invocation was
            uint256 timeLastDrawnOrStart = lastDrawnAt[_user] == 0
                ? startDistribution
                : lastDrawnAt[_user];

            // Find out how much time has past since last invocation
            uint256 timePassedSinceLastInvocation = currentTime.sub(
                timeLastDrawnOrStart
            );

            uint256 _remainingVestingTime = endDistribution.sub(
                timeLastDrawnOrStart
            );

            return
                _remainingBalance(_user).mul(timePassedSinceLastInvocation).div(
                    _remainingVestingTime
                );
        }
    }

    function _remainingBalance(address _user) internal view returns (uint256) {
        return vestedAmount[_user].sub(totalDrawn[_user]);
    }

    /**
     * @notice Draws down any vested tokens due
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDown(address _user) external onlyOwner nonReentrant {
        require(_getNow() > startDistribution, "Vesting not yet started");
        return _drawDown(_user);
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDraw(address _beneficiary)
        external
        onlyOwner
        nonReentrant
    {
        uint256 remainingBalance = _remainingBalance(_beneficiary);
        require(remainingBalance > 0, "Nothing left to draw");

        _drawDown(_beneficiary);
        remainingBalance = _remainingBalance(_beneficiary);
        if (remainingBalance > 0) {
            uint256 burnAmount = remainingBalance.mul(preMaturePenalty).div(
                1000
            );
            uint256 effectiveAmount = remainingBalance.sub(burnAmount);

            totalDrawn[_beneficiary] = vestedAmount[_beneficiary];
            burntAmount[_beneficiary] = burntAmount[_beneficiary].add(
                burnAmount
            );
            cnt.safeTransfer(_beneficiary, effectiveAmount);
            cnt.safeTransfer(l2Burner, burnAmount);
            emit PreMatureDrawn(_beneficiary, burnAmount, effectiveAmount);
        }
    }

    function _drawDown(address _beneficiary) internal {
        require(vestedAmount[_beneficiary] > 0, "No vesting found");

        uint256 amount = _availableDrawDownAmount(_beneficiary);
        if (amount == 0) return;

        uint256 currentTime = _getNow();

        if (currentTime > endDistribution && totalDrawn[_beneficiary] == 0) {
            bonusReward[_beneficiary] = amount.mul(bonusPercentage).div(1000);
        }

        // Update last drawn to now
        lastDrawnAt[_beneficiary] = currentTime;
        // Increase total drawn amount
        totalDrawn[_beneficiary] = totalDrawn[_beneficiary].add(amount);

        // Safety measure - this should never trigger
        require(
            totalDrawn[_beneficiary] <= vestedAmount[_beneficiary],
            "Safety Mechanism - Drawn exceeded Amount Vested"
        );

        // Issue tokens to beneficiary
        cnt.safeTransfer(_beneficiary, amount.add(bonusReward[_beneficiary]));
        emit DrawDown(_beneficiary, amount, bonusReward[_beneficiary]);
    }

    /**
     * @notice Function to add Bonus Rewards for user who hasn't vested any amount untill endDistribution
     * @dev Must be called directly by the owner
     */
    function addBonusRewards(uint256 _bonusRewards) external onlyOwner {
        bonusRewardsPool = bonusRewardsPool.add(_bonusRewards);
    }

    /**
     * @notice Function to remove any extra Bonus Rewards sent to this contract
     * @dev Must be called directly by the owner
     */
    function removeBonusRewards(address _owner) external onlyOwner {
        uint256 cntBalance = cnt.balanceOf(address(this));
        uint256 bonus = bonusRewardsPool;
        bonusRewardsPool = 0;
        if (cntBalance < bonus) {
            cnt.safeTransfer(_owner, cntBalance);
        } else {
            cnt.safeTransfer(_owner, bonus);
        }
    }
}
