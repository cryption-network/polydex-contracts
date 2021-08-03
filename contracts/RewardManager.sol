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
    
    address public farmContract;
    
    // Call from excludedAddresses will be whitelisted & rewards harvested from farm will not be vested
    mapping (address => bool) excludedAddresses;
    
    // preMaturePenalty will be sent to burner address
    address public l2Burner;
    
    //Upfront rewards unlock in percentage
    uint256 public upfrontUnlock;
    
    //Pre mature penalty in percentage
    uint256 public preMaturePenalty;
    
    /// @notice start of Distribution phase as a timestamp
    uint256 public startDistribution;

    /// @notice end of accumulation phase as a timestamp
    uint256 public endAccumulation;
    
    //Cryption Network Token (cnt) token address
    IERC20 public cnt;
    
    /// @notice amount vested for a user.
    mapping(address => uint256) public vestedAmount;
    
    /// @notice cumulative total of tokens drawn down (and transferred from the deposit account) per beneficiary
    mapping(address => uint256) public totalDrawn;

    
    /// @notice event emitted when a vesting schedule is created
    event Vested(address indexed _beneficiary, uint256 indexed value);
    
    /// @notice event emitted when a successful drawn down of vesting tokens is made
    event DrawDown(address indexed _beneficiary, uint256 indexed _amount);
    
     /// @notice event emitted when a successful pre mature drawn down of vesting tokens is made
    event PreMatureDrawn(address indexed _beneficiary, uint256 indexed burntAmount, uint256 indexed userWithdrawn);
    
    /**
     * @notice Construct a new Reward Manager contract
     * @param _cnt cnt token address
     * @param _startDistribution start timestamp
     * @param _endAccumulation end timestamp
     * @param _farmContract Address of Farimg contract
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _burner Burner for collecting preMaturePenalty
     * @dev deployer of contract on constructor is set as owner
     */
    constructor (
        IERC20 _cnt,
        uint256 _startDistribution,
        uint256 _endAccumulation,
        address _farmContract,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        address _burner)
    {
        require(_endAccumulation > _startDistribution, "end time should be greater than start");
        cnt = _cnt;
        startDistribution = _startDistribution;
        endAccumulation = _endAccumulation;
        farmContract = _farmContract;
        upfrontUnlock = _upfrontUnlock;
        preMaturePenalty = _preMaturePenalty;
        l2Burner = _burner;
    }
        
    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }
    
    function changeDistributionStartTime(uint256 _updatedStartTime) external onlyOwner{
        require(startDistribution > _getNow(), "Start time should be of future");
        startDistribution = _updatedStartTime;
    }
    
    function updateUpfrontUnlock(uint256 _newUpfrontUnlock) external onlyOwner{
        upfrontUnlock = _newUpfrontUnlock;
    }
        
    function handleRewardsForUser(
        address user,
        uint256 rewardAmount,
        uint256 timestamp,
        uint256 pid,
        uint256 rewardDebt
    ) external {
        require(msg.sender == farmContract,"Not Farm Contract");
        if(rewardAmount > 0){
            if(excludedAddresses[user]){
                cnt.safeTransfer(user, rewardAmount);
            }
            else{
                uint256 upfrontAmount = rewardAmount.mul(upfrontUnlock).div(1e18);
                cnt.safeTransfer(user, upfrontAmount);
                vest(user, rewardAmount.sub(upfrontAmount));
            }
        }
    }
    
    function vest(address _user, uint256 _amount) internal {
        require(_getNow() < startDistribution, "Cannot vest");
        require(_user != address(0), "Cannot vest for Zero address");

        vestedAmount[_user] = vestedAmount[_user].add(_amount);

        emit Vested(_user, _amount);
    }
    
    /**
     * @notice Vesting schedule data associated for a user
     * @dev Must be called directly by the beneficiary assigned the tokens in the schedule
     * @return Total vested amount for user
     * @return total token drawn by user
     * @return token available to be claimed
     * @return tokens still due (and currently locked) from vesting schedule
     */
    function vestingInfo(address _user)
    external view
    returns (uint256 , uint256 , uint256 , uint256 ) {
        return (
        vestedAmount[_user],
        totalDrawn[_user],
        _availableDrawDownAmount(_user),
        vestedAmount[_user].sub(totalDrawn[_user])
        );
    }

    function _availableDrawDownAmount(address _user) internal view returns (uint256) {
        uint256 currentTime = _getNow();
        if (currentTime < startDistribution) {
            return 0;
        } else if (currentTime >= endAccumulation) {
            return vestedAmount[_user].sub(totalDrawn[_user]);
        }
    }
    
    
    /**
     * @notice Draws down any vested tokens due
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting 
     */
    function drawDown() external nonReentrant returns (bool) {
        require(_getNow() >= startDistribution, "Distribution period not yet started");
        return _drawDown(msg.sender);
    }

    
    function _drawDown(address _beneficiary) internal returns (bool) {
        require(vestedAmount[_beneficiary] > 0, "No vesting found");

        uint256 amount = _availableDrawDownAmount(_beneficiary);
        require(amount > 0, "No allowance left to withdraw");

        // Increase total drawn amount
        totalDrawn[_beneficiary] = totalDrawn[_beneficiary].add(amount);

        // Safety measure - this should never trigger
        require(
            totalDrawn[_beneficiary] <= vestedAmount[_beneficiary],
            "Safety Mechanism - Drawn exceeded Amount Vested"
        );

        // Issue tokens to beneficiary
        cnt.safeTransfer(_beneficiary, amount);

        emit DrawDown(_beneficiary, amount);

        return true;
    }

}