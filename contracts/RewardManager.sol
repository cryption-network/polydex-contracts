// SPDX-License-Identifier: MIT
pragma solidity = 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RewardManager is Ownable, ReentrancyGuard
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // whitelisted rewardDistributors
    mapping (address => bool) public rewardDistributor;
    
    // Call from excludedAddresses will be whitelisted & rewards harvested from farm will not be vested
    mapping (address => bool) public excludedAddresses;
    
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

    /// @notice total tokens burnt per beneficiary
    mapping(address => uint256) public burntAmount;

    /// @notice bonus rewards entitled per beneficiary
    mapping(address => uint256) public bonusReward;

    /// @notice event emitted when a vesting schedule is created
    event Vested(address indexed _beneficiary, uint256 indexed value);
    
    /// @notice event emitted when a successful drawn down of vesting tokens is made
    event DrawDown(address indexed _beneficiary, uint256 indexed _amount, uint256 indexed bonus);
    
     /// @notice event emitted when a successful pre mature drawn down of vesting tokens is made
    event PreMatureDrawn(address indexed _beneficiary, uint256 indexed burntAmount, uint256 indexed userEffectiveWithdrawn);

    modifier checkPercentages(uint256 _upfrontUnlock, uint256 _preMaturePenalty) {
        require(_upfrontUnlock.add(_preMaturePenalty) <= 1000, "Invalid Percentages");
        _;
    }

    modifier checkTime(uint256 _startDistribution, uint256 _endDistribution) {
        require(_endDistribution > _startDistribution, "end time should be greater than start");
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
    constructor (
        IERC20 _cnt,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage,
        address _burner) 
        checkPercentages(_upfrontUnlock, _preMaturePenalty)
        checkTime(_startDistribution, _endDistribution)

    {
        cnt = _cnt;
        startDistribution = _startDistribution;
        endDistribution = _endDistribution;
        upfrontUnlock = _upfrontUnlock;
        preMaturePenalty = _preMaturePenalty;
        bonusPercentage = _bonusPercentage;
        l2Burner = _burner;
    }
        
    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }

    function updatePreMaturePenalty(uint256 _newpreMaturePenalty) external 
    checkPercentages(upfrontUnlock, _newpreMaturePenalty) 
    onlyOwner
    {
        preMaturePenalty = _newpreMaturePenalty;
    }

    function updateBonusPercentage(uint256 _newBonusPercentage) external 
    onlyOwner
    {
        bonusPercentage = _newBonusPercentage;
    }
    
    function updateDistributionTime(uint256 _updatedStartTime, uint256 _updatedEndTime) external 
    checkTime(_updatedStartTime, _updatedEndTime)
    onlyOwner
    {
        require(startDistribution > _getNow(), "Vesting already started can't update now");
        startDistribution = _updatedStartTime;
        endDistribution = _updatedEndTime;
    }
    
    function updateUpfrontUnlock(uint256 _newUpfrontUnlock) external 
    checkPercentages(_newUpfrontUnlock, preMaturePenalty) 
    onlyOwner
    {
        upfrontUnlock = _newUpfrontUnlock;
    }

    function updateWhitelistAddress(address _excludeAddress, bool status) external onlyOwner{
        excludedAddresses[_excludeAddress] = status;
    }

    function updateRewardDistributor(address _distributor, bool status) external onlyOwner{
        rewardDistributor[_distributor] = status;
    }
        
    function handleRewardsForUser(
        address user,
        uint256 rewardAmount,
        uint256 timestamp,
        uint256 pid,
        uint256 rewardDebt
    ) external {
        require(rewardDistributor[msg.sender],"Not a valid RewardDistributor");
        if(rewardAmount > 0){
            if(excludedAddresses[user]){
                cnt.safeTransfer(user, rewardAmount);
            }
            else{
                uint256 upfrontAmount = rewardAmount.mul(upfrontUnlock).div(1000);
                cnt.safeTransfer(user, upfrontAmount);
                _vest(user, rewardAmount.sub(upfrontAmount));
            }
        }
    }
    
    function _vest(address _user, uint256 _amount) internal {
        require(_getNow() < startDistribution, " Cannot vest in distribution phase");
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
    public view
    returns (uint256 totalVested, uint256 totalDrawnAmount, uint256 amountBurnt, uint256 claimable, uint256 bonusRewards, uint256 stillDue) {
        return (
        vestedAmount[_user],
        totalDrawn[_user],
        burntAmount[_user],
        _availableDrawDownAmount(_user),
        bonusReward[_user],
        _remainingBalance(_user)
        );
    }

    function _availableDrawDownAmount(address _user) internal view returns (uint256) {
        uint256 currentTime = _getNow();
        if (currentTime < startDistribution) {
            return 0;
        } else if (currentTime >= endDistribution || totalDrawn[_user] == vestedAmount[_user]) {
            return _remainingBalance(_user);
        }
        else {
            uint256 elapsedTime = currentTime.sub(startDistribution);
            uint256 _totalVestingTime = endDistribution.sub(startDistribution);
            return vestedAmount[_user].mul(elapsedTime).div(_totalVestingTime).sub(totalDrawn[_user]);
        }
    }

    function _remainingBalance(address _user) internal view returns (uint256) {
        return vestedAmount[_user].sub(totalDrawn[_user]);
    }
    
    
    /**
     * @notice Draws down any vested tokens due
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting 
     */
    function drawDown() external nonReentrant {
        require(_getNow() > startDistribution, "Vesting not yet started");
        return _drawDown(msg.sender);
    }
    
    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting 
     */
    function preMatureDraw() external nonReentrant {
            address _beneficiary = msg.sender;
            require(_remainingBalance(_beneficiary) > 0, "Nothing left to draw");

            _drawDown(_beneficiary);
            
            (,,,,,uint256 remainingBalance) = vestingInfo(_beneficiary);
            if(remainingBalance > 0){
                uint256 burnAmount = remainingBalance.mul(preMaturePenalty).div(1000);
                uint256 effectivePercentage = 1000 - preMaturePenalty;
                uint256 effectiveAmount = remainingBalance.mul(effectivePercentage).div(1000);

                totalDrawn[_beneficiary] = vestedAmount[_beneficiary];
                burntAmount[_beneficiary] = burntAmount[_beneficiary].add(burnAmount);
                cnt.safeTransfer(_beneficiary, effectiveAmount);
                cnt.safeTransfer(l2Burner, burnAmount);
                emit PreMatureDrawn(_beneficiary, burnAmount, effectiveAmount);
            }
    }

    
    function _drawDown(address _beneficiary) internal {
        require(vestedAmount[_beneficiary] > 0, "No vesting found");

        uint256 amount = _availableDrawDownAmount(_beneficiary);
        if(amount == 0) return;

        if(_getNow() > endDistribution && totalDrawn[_beneficiary] == 0){
            bonusReward[_beneficiary] = amount.mul(bonusPercentage).div(1000);
        }
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

}