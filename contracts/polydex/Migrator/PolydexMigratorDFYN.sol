// SPDX-License-Identifier: MIT

pragma solidity =0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IPolydexPair.sol";
import "../interfaces/IPolydexRouter.sol";
import "../interfaces/IPolydexFactory.sol";
import "../libraries/PolydexLibrary.sol";
import "../interfaces/IFarm.sol";
import '../interfaces/IWETH.sol';
import "../interfaces/IStakingPool.sol";

// Migrator helps you migrate your existing LP tokens to Polydex LP ones
contract PolyDexMigratorDFYN {
using SafeERC20 for IERC20;

    IPolydexRouter public oldRouter;
    IPolydexRouter public router;
    address public WETH;
    address public dfynWeth;


    constructor(IPolydexRouter _oldRouter, IPolydexRouter _router,address _WETH,address _dfynWeth) public {
        oldRouter = _oldRouter;
        router = _router;
        dfynWeth = _dfynWeth;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == dfynWeth || msg.sender == WETH); // only accept ETH via fallback from the WETH and dfynWETH contract
    }

    function migrateWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IPolydexPair pair = IPolydexPair(pairForOldRouter(tokenA, tokenB));
        pair.permit(msg.sender, address(this), liquidity, deadline, v, r, s);

        migrate(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline);
    }

    // msg.sender should have approved 'liquidity' amount of LP token of 'tokenA' and 'tokenB'
    function migrate(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    ) public {
        require(deadline >= block.timestamp, 'Swap: EXPIRED');
        address TokenA = tokenA;
        address TokenB = tokenB;
        // Remove liquidity from the old router with permit
        (uint256 amountA, uint256 amountB) = removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            deadline
        );

        if( tokenA == dfynWeth){
          IWETH(dfynWeth).withdraw(amountA);
          IWETH(WETH).deposit{value: amountA}();
          TokenA = WETH;
        }

        if( tokenB == dfynWeth){
          IWETH(dfynWeth).withdraw(amountB);
          IWETH(WETH).deposit{value: amountB}();
          TokenB = WETH;
        }

        // Add liquidity to the new router
        (uint256 pooledAmountA, uint256 pooledAmountB) = addLiquidity(TokenA, TokenB, amountA, amountB);

        // Send remaining tokens to msg.sender
        if (amountA > pooledAmountA) {
            IERC20(TokenA).safeTransfer(msg.sender, amountA - pooledAmountA);
        }
        if (amountB > pooledAmountB) {
            IERC20(TokenB).safeTransfer(msg.sender, amountB - pooledAmountB);
        }
    }

    function migrateWithDeposit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline,
        address _Farm,
        uint256 pid
    ) public {
        require(deadline >= block.timestamp, 'Swap: EXPIRED');
        address TokenA = tokenA;
        address TokenB = tokenB;
        // Remove liquidity from the old router with permit
        (uint256 amountA, uint256 amountB) = removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            deadline
        );

        if( tokenA == dfynWeth){
          IWETH(dfynWeth).withdraw(amountA);
          IWETH(WETH).deposit{value: amountA}();
          TokenA = WETH;
        }

        if( tokenB == dfynWeth){
          IWETH(dfynWeth).withdraw(amountB);
          IWETH(WETH).deposit{value: amountB}();
          TokenB = WETH;
        }

        // Add liquidity to the new router
        (uint256 pooledAmountA, uint256 pooledAmountB) = addLiquidityWithDeposit(TokenA, TokenB, amountA, amountB, pid, _Farm);


        // Send remaining tokens to msg.sender
        if (amountA > pooledAmountA) {
            IERC20(TokenA).safeTransfer(msg.sender, amountA - pooledAmountA);
        }
        if (amountB > pooledAmountB) {
            IERC20(TokenB).safeTransfer(msg.sender, amountB - pooledAmountB);
        }
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    ) internal returns (uint256 amountA, uint256 amountB) {
        IPolydexPair pair = IPolydexPair(pairForOldRouter(tokenA, tokenB));
        pair.transferFrom(msg.sender, address(pair), liquidity);
        (uint256 amount0, uint256 amount1) = pair.burn(address(this));
        (address token0,) = PolydexLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'PolyDexMigrator: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'PolyDexMigrator: INSUFFICIENT_B_AMOUNT');
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairForOldRouter(address tokenA, address tokenB) internal view returns (address pair) {
        (address token0, address token1) = PolydexLibrary.sortTokens(tokenA, tokenB);
        pair = address(uint(keccak256(abi.encodePacked(
                hex'ff',
                oldRouter.factory(),
                keccak256(abi.encodePacked(token0, token1)),
                // Init code hash. It would be specific each exchange(different for quickswap, dfyn, etc).
                // So when deploying Migrator, change it.
                hex'f187ed688403aa4f7acfada758d8d53698753b998a3071b06f1b777f4330eaf3' // dfyn init code hash
            ))));
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal returns (uint amountA, uint amountB) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired);
        address pair = PolydexLibrary.pairFor(router.factory(), tokenA, tokenB);
        IERC20(tokenA).safeTransfer(pair, amountA);
        IERC20(tokenB).safeTransfer(pair, amountB);
        IPolydexPair(pair).mint(msg.sender);
    }

    function addLiquidityWithDeposit(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 pid,
        address _Farm
    ) internal returns (uint amountA, uint amountB) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired);
        address pair = PolydexLibrary.pairFor(router.factory(), tokenA, tokenB);
        IERC20(tokenA).safeTransfer(pair, amountA);
        IERC20(tokenB).safeTransfer(pair, amountB);
        uint256 liquidity = IPolydexPair(pair).mint(address(this));
        IPolydexPair(pair).approve(_Farm,liquidity);
        if(pid == uint256(-1)){
            IStakingPool(_Farm).depositFor(liquidity, msg.sender);
        }else{
            IFarm(_Farm).depositFor(pid, liquidity, msg.sender);
        }
    }


    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal returns (uint256 amountA, uint256 amountB) {
        // create the pair if it doesn't exist yet
        IPolydexFactory factory = IPolydexFactory(router.factory());
        if (factory.getPair(tokenA, tokenB) == address(0)) {
            factory.createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = PolydexLibrary.getReserves(address(factory), tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = PolydexLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = PolydexLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
}
