// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IPolydexPair.sol";
import "../interfaces/IPolydexRouter.sol";
import "../interfaces/IPolydexFactory.sol";
import "../interfaces/IFarm.sol";
import "../interfaces/IDappFactoryFarm.sol";
import "../interfaces/IRewardManager.sol";
import "../libraries/TransferHelper.sol";

// QuickSwapMigrator helps you migrate your Polydex LP tokens to Quickswap LP tokens
contract QuickSwapMigrator is Ownable, ReentrancyGuard {
    IPolydexFactory public immutable polydexFactory;
    IPolydexFactory public immutable quickswapFactory;

    IPolydexRouter public immutable polydexRouter;
    IPolydexRouter public immutable quickswapRouter;

    IFarm public polydexFarm;
    IDappFactoryFarm public quickswapFarm;

    IRewardManager public rewardManager;

    address public immutable wmatic;
    address public immutable cnt;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    struct LiquidityVars {
        address tokenA;
        address tokenB;
        uint256 amountAReceived;
        uint256 amountBReceived;
        uint256 amountAadded;
        uint256 amountBadded;
        uint256 amountAleft;
        uint256 amountBleft;
        uint256 lpReceived;
    }

    LiquidityVars private liquidityVars;

    event LiquidityMigrated(
        uint256 tokenAadded,
        uint256 tokenBadded,
        uint256 newLPAmount
    );

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(
            addressToCheck != address(0),
            "QuickSwapMigrator: No zero address"
        );
        _;
    }

    constructor(
        IPolydexRouter _polydexRouter,
        IPolydexRouter _quickswapRouter,
        IFarm _polydexFarm,
        IDappFactoryFarm _quickswapFarm,
        IRewardManager _rewardManger,
        address _cnt
    ) {
        require(_cnt != address(0), "QuickSwapMigrator: No zero address");
        polydexRouter = _polydexRouter;
        quickswapRouter = _quickswapRouter;
        polydexFactory = IPolydexFactory(_polydexRouter.factory());
        quickswapFactory = IPolydexFactory(_quickswapRouter.factory());
        wmatic = _polydexRouter.WETH();
        polydexFarm = _polydexFarm;
        quickswapFarm = _quickswapFarm;
        rewardManager = _rewardManger;
        cnt = _cnt;
    }

    // need to call addUserToWhiteList before this
    //Prerequisite: in RewardManager excludedAddresses[LiquidityMigrator_Contract] & rewardDistributor[LiquidityMigrator_Contract] should be set to true
    function migrate(
        uint256 _oldPid,
        uint256 _lpAmount,
        IPolydexPair _oldLPAddress,
        IPolydexPair _newLPAddress
    )
        external
        nonReentrant
        ensureNonZeroAddress(address(_oldLPAddress))
        ensureNonZeroAddress(address(_newLPAddress))
    {
        //general checks
        require(
            _lpAmount > 0,
            "QuickSwapMigrator: LP Amount should be greater than zero"
        );
        require(_oldPid == 0, "QuickSwapMigrator: Invalid pid");

        //validate LP addresses
        IPolydexPair oldLPAddress = IPolydexPair(
            polydexFactory.getPair(wmatic, cnt)
        );
        IPolydexPair newLPAddress = IPolydexPair(
            quickswapFactory.getPair(wmatic, cnt)
        );
        require(
            _oldLPAddress == oldLPAddress && _newLPAddress == newLPAddress,
            "QuickSwapMigrator: Invalid LP token addresses"
        );

        //Withdraw old LP tokens
        polydexFarm.withdrawFor(_oldPid, _lpAmount, msg.sender);
        require(
            oldLPAddress.balanceOf(address(this)) >= _lpAmount,
            "QuickSwapMigrator: Insufficient old LP Balance"
        );

        //Migrator vests users's CNT to reward manager for the user
        uint256 cntBalance = IERC20(cnt).balanceOf(address(this));
        if (cntBalance > 0) {
            TransferHelper.safeTransfer(
                address(cnt),
                address(rewardManager),
                cntBalance
            );
            rewardManager.handleRewardsForUser(
                msg.sender,
                cntBalance,
                block.timestamp,
                _oldPid,
                0
            );
        }

        liquidityVars.tokenA = oldLPAddress.token0();
        liquidityVars.tokenB = oldLPAddress.token1();

        //Approve old LP to the router
        TransferHelper.safeApprove(
            address(oldLPAddress),
            address(polydexRouter),
            _lpAmount
        );

        //Remove liquidity
        (
            liquidityVars.amountAReceived,
            liquidityVars.amountBReceived
        ) = polydexRouter.removeLiquidity(
            liquidityVars.tokenA,
            liquidityVars.tokenB,
            _lpAmount,
            1,
            1,
            address(this),
            DEADLINE
        );

        //transform liquidity from polydex to quickswap
        _transFormLiquidity();

        //Check pending balances of tokens in the old LP
        liquidityVars.amountAleft = IERC20(liquidityVars.tokenA).balanceOf(
            address(this)
        );
        liquidityVars.amountBleft = IERC20(liquidityVars.tokenB).balanceOf(
            address(this)
        );

        //Transfer pending tokens with any remaining dust
        if (liquidityVars.amountAleft > 0)
            TransferHelper.safeTransfer(
                liquidityVars.tokenA,
                msg.sender,
                liquidityVars.amountAleft
            );
        if (liquidityVars.amountBleft > 0)
            TransferHelper.safeTransfer(
                liquidityVars.tokenB,
                msg.sender,
                liquidityVars.amountBleft
            );

        if (newLPAddress.balanceOf(address(this)) >= liquidityVars.lpReceived)
            _depositLP(
                address(newLPAddress),
                liquidityVars.lpReceived,
                msg.sender
            );

        emit LiquidityMigrated(
            liquidityVars.amountAadded,
            liquidityVars.amountBadded,
            liquidityVars.lpReceived
        );
    }

    function _depositLP(
        address _pairAddress,
        uint256 _lpAmount,
        address _user
    ) internal {
        TransferHelper.safeApprove(
            address(_pairAddress),
            address(quickswapFarm),
            _lpAmount
        );
        quickswapFarm.depositFor(_lpAmount, _user);
    }

    // Rescue any tokens that have not been able to processed by the contract
    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "QuickSwapMigrator: Insufficient token balance");
        TransferHelper.safeTransfer(address(_token), msg.sender, balance);
    }

    function _transFormLiquidity() internal {
        TransferHelper.safeApprove(
            address(liquidityVars.tokenA),
            address(quickswapRouter),
            liquidityVars.amountAReceived
        );

        TransferHelper.safeApprove(
            address(liquidityVars.tokenB),
            address(quickswapRouter),
            liquidityVars.amountBReceived
        );

        (
            liquidityVars.amountAadded,
            liquidityVars.amountBadded,
            liquidityVars.lpReceived
        ) = quickswapRouter.addLiquidity(
            liquidityVars.tokenA,
            liquidityVars.tokenB,
            liquidityVars.amountAReceived,
            liquidityVars.amountBReceived,
            1,
            1,
            address(this),
            DEADLINE
        );

        require(
            liquidityVars.lpReceived > 0,
            "QuickSwapMigrator: Add Liquidity Error"
        );
    }
}
