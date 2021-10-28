// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./RewardManager.sol";

contract RewardManagerFactory is Ownable{
    using SafeMath for uint256;
    using SafeMath for uint128;

    /// @notice all the information for this RewardManager in one struct
    struct RewardManagerInfo {
        address managerAddress;
        uint256 startDistribution;
        uint256 endDistribution;
    }

    RewardManagerInfo[] public managers;

    uint256 public managerIndex;
    
    uint256 public totalRewardManagers;

    event RewardManagerLaunched(
        address indexed mangerAddress,
        uint256 indexed startDistributionTime,
        uint256 indexed endDistributionTime
    );

    /**
     * @notice Creates a new Reward Manager contract and registers it in the Factory Contract
     * @param _cnt cnt token address
     * @param _startDistribution start timestamp
     * @param _endDistribution end timestamp
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _bonusPercentage Bonus rewards percentage for user who hasn't drawn any rewards untill endDistribution
     * @param _burner Burner for collecting preMaturePenalty
     * @dev deployer of contract on constructor is set as owner
     */
    function launchRewardManager(
        IERC20 _cnt,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage,
        address _burner) 
        public
        onlyOwner
    {

        require(address(_cnt) != address(0), "Cant be Zero address");
        require(address(_burner) != address(0), "Burner Cant be Zero address");
        
        require(
            _startDistribution >= block.timestamp,
            "Start time should be greater than current"
        ); // ideally at least 24 hours more to give investors time
        
        require(
            _endDistribution > _startDistribution,
            "Distribution End Time should be greater than crowdsale StartTime"
        );

        RewardManager newManager = new RewardManager
        (
            _cnt,
            _startDistribution,
            _endDistribution,
            _upfrontUnlock,
            _preMaturePenalty,
            _bonusPercentage,
            _burner
        );

        managers.push(
            RewardManagerInfo({ 
                managerAddress: address(newManager),
                startDistribution: _startDistribution,
                endDistribution: _endDistribution
            })
        ); //stacking up every crowdsale info ever made to crowdsales variable

        emit RewardManagerLaunched(
            address(newManager),
            _startDistribution,
            _endDistribution
        );
        managerIndex++;
    }
    
    function getTotalRewardManagers() public view returns (uint256){
        return managers.length;
    }
    
    function removeRewardManager(uint256 _index) public onlyOwner {
        require(_index <= managerIndex, "Invalid Index");
        delete managers[_index];
    }
}
