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
    
    //Upfront rewards unlock in percentage
    uint256 public upfrontUnlock;
    
    //Pre mature penalty in percentage
    uint256 public preMaturePenalty;
    
    /// @notice start of vesting period as a timestamp
    uint256 public start;

    /// @notice end of vesting period as a timestamp
    uint256 public end;
    
    //Cryption Network Token (cnt) token address
    IERC20 public cnt;
    
    /// @notice amount vested for a user.
    mapping(address => uint256) public vestedAmount;
    
    /// @notice cumulative total of tokens drawn down (and transferred from the deposit account) per beneficiary
    mapping(address => uint256) public totalDrawn;

    
    /// @notice event emitted when a vesting schedule is created
    event Vested(address indexed _beneficiary, uint256 value);
    
    /// @notice event emitted when a successful drawn down of vesting tokens is made
    event DrawDown(address indexed _beneficiary, uint256 indexed _amount);
    
    /**
     * @notice Construct a new Reward Manager contract
     * @param _cnt cnt token address
     * @param _start start timestamp
     * @param _end end timestamp
     * @param _farmContract Address of Farimg contract
     * @param _vaultStrategy Address of Vault Startegy contract that would be whitelisted from vesting
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @dev deployer of contract on constructor is set as owner
     */
    constructor (
        IERC20 _cnt,
        uint256 _start,
        uint256 _end,
        address _farmContract,
        address _vaultStrategy,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty)
    {
        require(_end > _start, "end time should be greater than start");
        cnt = _cnt;
        start = _start;
        end = _end;
        farmContract = _farmContract;
        vaultStrategyContract = _vaultStrategy;
        upfrontUnlock = _upfrontUnlock;
        preMaturePenalty = _preMaturePenalty;
    }
        
    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }
    
    function changeVestingStartTime(uint256 _updatedStartTime) external onlyOwner{
        require(start > _getNow(), "Start time should be of future");
        start = _updatedStartTime;
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
        require(_getNow() < start, "Cannot vest");
        require(_user != address(0), "Cannot vest for Zero address");

        vestedAmount[_user] = vestedAmount[_user].add(_amount);

        emit Vested(_user, _amount);
    }
    
    /**
     * @notice Vesting schedule data associated for a user
     * @dev Must be called directly by the beneficiary assigned the tokens in the schedule
     * @return Total vested amount for user
     * @return total token drawn by user
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
        if (currentTime < start) {
            return 0;
        } else if (currentTime >= end) {
            return vestedAmount[_user].sub(totalDrawn[_user]);
        } else {
            uint256 elapsedTime = currentTime.sub(start);
            uint256 _totalVestingTime = end.sub(start);
            return vestedAmount[_user].mul(elapsedTime).div(_totalVestingTime).sub(totalDrawn[_user]);
        }
    }
    
    
    /**
     * @notice Draws down any vested tokens due
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting 
     */
    function drawDown() external nonReentrant returns (bool) {
        require(_getNow() > start, "Still vesting period");
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