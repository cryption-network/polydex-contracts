// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./RewardManager.sol";

contract RewardManagerFactory is Ownable {
    using SafeMath for uint256;
    using SafeMath for uint128;

    /// @notice all the information for this RewardManager in one struct
    struct RewardManagerInfo {
        address managerAddress;
        uint256 startDistribution;
        uint256 endDistribution;
    }

    struct UserInfo {
        uint256 _totalVested;
        uint256 _totalDrawnAmount;
        uint256 _amountBurnt;
        uint256 _claimable;
        uint256 _bonusRewards;
        uint256 _stillDue;
    }

    RewardManagerInfo[] public managers;

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
        address _burner
    ) public onlyOwner {
        require(address(_cnt) != address(0), "Cant be Zero address");
        require(address(_burner) != address(0), "Burner Cant be Zero address");

        require(
            _startDistribution >= block.timestamp,
            "Start time should be greater than current"
        ); // ideally at least 24 hours more to give investors time

        require(
            _endDistribution > _startDistribution,
            "EndDistribution should be more than startDistribution"
        );

        RewardManager newManager = new RewardManager(
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
        totalRewardManagers++;
    }

    function removeRewardManager(uint256 _index) public onlyOwner {
        require(_index <= totalRewardManagers, "Invalid Index");
        delete managers[_index];
    }

    function userTotalVestingInfo(address _user)
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
        UserInfo memory user;
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                RewardManager manager = RewardManager(rewardManagerAddress);
                (
                    user._totalVested,
                    user._totalDrawnAmount,
                    user._amountBurnt,
                    user._claimable,
                    user._bonusRewards,
                    user._stillDue
                ) = manager.vestingInfo(_user);

                totalVested += user._totalVested;
                totalDrawnAmount += user._totalDrawnAmount;
                amountBurnt += user._amountBurnt;
                claimable += user._claimable;
                bonusRewards += user._bonusRewards;
                stillDue += user._stillDue;
            }
        }
    }

    /**
     * @notice Draws down any vested tokens due in all Reward Manager
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDown() external onlyOwner {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                RewardManager manager = RewardManager(rewardManagerAddress);
                manager.drawDown(msg.sender);
            }
        }
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDraw() external onlyOwner {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                RewardManager manager = RewardManager(rewardManagerAddress);
                manager.preMatureDraw(msg.sender);
            }
        }
    }

    function updatePreMaturePenalty(
        uint256 _index,
        uint256 _newpreMaturePenalty
    ) external onlyOwner {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updatePreMaturePenalty(_newpreMaturePenalty);
    }

    function updateBonusPercentage(uint256 _index, uint256 _newBonusPercentage)
        external
        onlyOwner
    {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updateBonusPercentage(_newBonusPercentage);
    }

    function updateDistributionTime(
        uint256 _index,
        uint256 _updatedStartTime,
        uint256 _updatedEndTime
    ) external onlyOwner {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updateDistributionTime(_updatedStartTime, _updatedEndTime);
    }

    function updateUpfrontUnlock(uint256 _index, uint256 _newUpfrontUnlock)
        external
        onlyOwner
    {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updateUpfrontUnlock(_newUpfrontUnlock);
    }

    function updateWhitelistAddress(
        uint256 _index,
        address _excludeAddress,
        bool status
    ) external onlyOwner {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updateWhitelistAddress(_excludeAddress, status);
    }

    function updateRewardDistributor(
        uint256 _index,
        address _distributor,
        bool status
    ) external onlyOwner {
        RewardManager manager = RewardManager(managers[_index].managerAddress);
        manager.updateRewardDistributor(_distributor, status);
    }
}
