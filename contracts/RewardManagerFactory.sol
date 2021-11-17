// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./polydex/interfaces/IRewardManager.sol";

contract RewardManagerFactory is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeMath for uint128;
    using SafeERC20 for IERC20;

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

    mapping(address => uint256) public managerIndex;

    // whitelisted rewardDistributors
    mapping(address => bool) public rewardDistributor;

    //Cryption Network Token (cnt) token address
    IERC20 public cnt;

    event RewardManagerLaunched(
        address indexed managerAddress,
        uint256 indexed startDistributionTime,
        uint256 indexed endDistributionTime
    );

    /**
     * @notice Construct a new Reward Manager Factory contract
     * @param _cnt cnt token address
     * @dev deployer of contract on constructor is set as owner
     */
    constructor(IERC20 _cnt) {
        cnt = _cnt;
    }

    modifier validateRewardManagerByIndex(uint256 _index) {
        require(_index < managers.length, "Reward Manager does not exist");
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        require(
            address(manager) != address(0),
            "Reward Manager Address cannot be zero address"
        );
        _;
    }

    /**
     * @notice Creates a new Reward Manager contract and registers it in the Factory Contract
     * @param _cnt cnt token address
     * @param _startDistribution start timestamp
     * @param _endDistribution end timestamp
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _bonusPercentage Bonus rewards percentage for user who hasn't drawn any rewards untill endDistribution
     * @param _burner Burner for collecting preMaturePenalty
     * @param _rewardManagerByteCode Bytecode of the reward manager contract to be deployed
     * @dev deployer of contract on constructor is set as owner
     */
    function launchRewardManager(
        IERC20 _cnt,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage,
        address _burner,
        bytes memory _rewardManagerByteCode
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

        uint256 salt = block.timestamp;
        bytes memory bytecode = abi.encodePacked(
            _rewardManagerByteCode,
            abi.encode(
                _cnt,
                _startDistribution,
                _endDistribution,
                _upfrontUnlock,
                _preMaturePenalty,
                _bonusPercentage,
                _burner
            )
        );

        address newRewardManagerAddress;
        assembly {
            newRewardManagerAddress := create2(
                0,
                add(bytecode, 0x20),
                mload(bytecode),
                salt
            )
            if iszero(extcodesize(newRewardManagerAddress)) {
                revert(0, 0)
            }
        }

        IRewardManager newManager = IRewardManager(newRewardManagerAddress);

        managers.push(
            RewardManagerInfo({
                managerAddress: address(newManager),
                startDistribution: _startDistribution,
                endDistribution: _endDistribution
            })
        );

        managerIndex[address(newManager)] = totalRewardManagers; //mapping every manager address to its index in the array

        emit RewardManagerLaunched(
            address(newManager),
            _startDistribution,
            _endDistribution
        );
        totalRewardManagers++;
    }

    function removeRewardManager(uint256 _index) public onlyOwner {
        require(_index < totalRewardManagers, "Invalid Index");
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
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (
                    user._totalVested,
                    user._totalDrawnAmount,
                    user._amountBurnt,
                    user._claimable,
                    user._bonusRewards,
                    user._stillDue
                ) = manager.vestingInfo(_user);

                if (user._totalVested > 0) {
                    totalVested += user._totalVested;
                    totalDrawnAmount += user._totalDrawnAmount;
                    amountBurnt += user._amountBurnt;
                    claimable += user._claimable;
                    bonusRewards += user._bonusRewards;
                    stillDue += user._stillDue;
                }
            }
        }
    }

    function handleRewardsForUser(
        address user,
        uint256 rewardAmount,
        uint256 timestamp,
        uint256 pid,
        uint256 rewardDebt
    ) external {
        require(rewardDistributor[msg.sender], "Not a valid RewardDistributor");
        //get the most active reward manager
        IRewardManager manager = IRewardManager(
            managers[managers.length - 1].managerAddress
        );
        require(address(manager) != address(0), "No Reward Manager Added");
        /* No use of if condition here to check if AddressZero since funds are transferred before calling handleRewardsForUser. Require is a must
        So if there is accidentally no strategy linked, it goes into else resulting in loss of user's funds.
        */
        cnt.safeTransfer(address(manager), rewardAmount);
        manager.handleRewardsForUser(
            user,
            rewardAmount,
            timestamp,
            pid,
            rewardDebt
        );
    }

    /**
     * @notice Draws down any vested tokens due in all Reward Manager
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDown() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , uint256 userClaimable, , ) = manager.vestingInfo(
                    msg.sender
                );
                if (userClaimable > 0) {
                    manager.drawDown(msg.sender);
                }
            }
        }
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDraw() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , , , uint256 userStillDue) = manager.vestingInfo(
                    msg.sender
                );
                if (userStillDue > 0) {
                    manager.preMatureDraw(msg.sender);
                }
            }
        }
    }

    function updatePreMaturePenalty(
        uint256 _index,
        uint256 _newpreMaturePenalty
    ) external onlyOwner validateRewardManagerByIndex(_index) {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.updatePreMaturePenalty(_newpreMaturePenalty);
    }

    function updateBonusPercentage(uint256 _index, uint256 _newBonusPercentage)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.updateBonusPercentage(_newBonusPercentage);
    }

    function updateDistributionTime(
        uint256 _index,
        uint256 _updatedStartTime,
        uint256 _updatedEndTime
    ) external onlyOwner validateRewardManagerByIndex(_index) {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.updateDistributionTime(_updatedStartTime, _updatedEndTime);
        managers[_index].startDistribution = _updatedStartTime;
        managers[_index].endDistribution = _updatedEndTime;
    }

    function updateUpfrontUnlock(uint256 _index, uint256 _newUpfrontUnlock)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.updateUpfrontUnlock(_newUpfrontUnlock);
    }

    function updateWhitelistAddress(
        uint256 _index,
        address _excludeAddress,
        bool status
    ) external onlyOwner validateRewardManagerByIndex(_index) {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.updateWhitelistAddress(_excludeAddress, status);
    }

    function updateRewardDistributor(address _distributor, bool status)
        external
        onlyOwner
    {
        rewardDistributor[_distributor] = status;
    }

    function addBonusRewards(uint256 _index, uint256 _bonusRewards)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        cnt.safeTransferFrom(msg.sender, address(manager), _bonusRewards);
        manager.addBonusRewards(_bonusRewards);
    }

    function removeBonusRewards(uint256 _index, address _owner)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        require(
            address(_owner) != address(0),
            "Address of owner receiving rewards should not be zero"
        );
        IRewardManager manager = IRewardManager(
            managers[_index].managerAddress
        );
        manager.removeBonusRewards(_owner);
    }
}
