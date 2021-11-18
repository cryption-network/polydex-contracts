// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IRewardManager {
    event Vested(address indexed _beneficiary, uint256 indexed value);

    event DrawDown(
        address indexed _beneficiary,
        uint256 indexed _amount,
        uint256 indexed bonus
    );

    event PreMatureDrawn(
        address indexed _beneficiary,
        uint256 indexed burntAmount,
        uint256 indexed userEffectiveWithdrawn
    );

    function startDistribution() external view returns (uint256);

    function endDistribution() external view returns (uint256);

    function updatePreMaturePenalty(uint256 _newpreMaturePenalty) external;

    function updateBonusPercentage(uint256 _newBonusPercentage) external;

    function updateDistributionTime(
        uint256 _updatedStartTime,
        uint256 _updatedEndTime
    ) external;

    function updateUpfrontUnlock(uint256 _newUpfrontUnlock) external;

    function updateWhitelistAddress(address _excludeAddress, bool status)
        external;

    function handleRewardsForUser(
        address user,
        uint256 rewardAmount,
        uint256 timestamp,
        uint256 pid,
        uint256 rewardDebt
    ) external;

    function vestingInfo(address _user)
        external
        view
        returns (
            uint256 totalVested,
            uint256 totalDrawnAmount,
            uint256 amountBurnt,
            uint256 claimable,
            uint256 bonusRewards,
            uint256 stillDue
        );

    function drawDown(address _user) external;

    function preMatureDraw(address _beneficiary) external;

    function addBonusRewards(uint256 _bonusRewards) external;

    function removeBonusRewards(address _owner) external;
}
