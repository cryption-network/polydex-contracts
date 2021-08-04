// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./polydex/interfaces/IPolydexERC20.sol";
import "./polydex/interfaces/IPolydexPair.sol";
import "./polydex/interfaces/IPolydexFactory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./polydex/interfaces/IPolydexRouter.sol";

// Converter is Farm's left hand and kinda a wizard. He can create up CNT from pretty much anything!
// This contract handles "serving up" rewards for xCNT holders & also burning some by trading tokens collected from fees for CNT.

contract Converter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    

    IPolydexFactory public factory;
    IPolydexRouter public router;
    address public cntStaker;
    // The CNT TOKEN!
    IERC20 public cnt;
    address public wmatic;
    address public l2Burner;
    uint16 public burnAllocation;
    uint16 public stakersAllocation;
    uint16 public platformFeesAllocation;
    address public platformAddr;
    uint256 private totalCNTAccumulated;

    event CNTConverted(
        uint256 stakersAllocated,
        uint256 burnt,
        uint256 platformFees
    );

    constructor(
        IPolydexFactory _factory,
        address _cntStaker,
        IERC20 _cnt,
        address _l2Burner,
        address _wmatic,
        uint16 _burnAllocation,
        uint16 _stakersAllocation,
        uint16 _platformFeesAllocation,
        address _platformAddr
    ) {
        factory = _factory;
        cnt = _cnt;
        cntStaker = _cntStaker;
        l2Burner = _l2Burner;
        wmatic = _wmatic;
        platformAddr = _platformAddr;
        setAllocation(
            _burnAllocation,
            _stakersAllocation,
            _platformFeesAllocation
        );
        router = IPolydexRouter(0xBd13225f0a45BEad8510267B4D6a7c78146Be459);
    }

    function updateL2Burner(address _l2Burner) external onlyOwner {
        require(_l2Burner != address(0), "No zero address");
        l2Burner = _l2Burner;
    }


    function updateRouter(IPolydexRouter _router) external onlyOwner {
        require(address(_router) != address(0), "No zero address");
        router = _router;
    }

    // Set the allocation to handle accumulated swap fees
    function setAllocation(
        uint16 _burnAllocation,
        uint16 _stakersAllocation,
        uint16 _platformFeesAllocation
    ) public onlyOwner {
        require(
            _burnAllocation + _stakersAllocation + _platformFeesAllocation ==
                1000,
            "invalid allocations"
        );
        burnAllocation = _burnAllocation;
        stakersAllocation = _stakersAllocation;
        platformFeesAllocation = _platformFeesAllocation;
    }

    function updateCntStaker(address _newCntStaker) external onlyOwner {
        require(_newCntStaker != address(0), "Address cant be zero Address");
        cntStaker = _newCntStaker;
    }

    function convert(address token0, address token1) external nonReentrant() {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        IPolydexPair pair = IPolydexPair(factory.getPair(token0, token1));

        require(address(pair) != address(0), "Invalid pair");

        _safeTransfer(
            address(pair),
            address(pair),
            pair.balanceOf(address(this))
        );

        pair.burn(address(this));
        // First we convert everything to WMATIC
        uint256 wmaticAmount = _toWMATIC(token0) + _toWMATIC(token1);
        // Then we convert the WMATIC to CryptionToken
        _toCNT(wmaticAmount);
        emit CNTConverted(
            totalCNTAccumulated.mul(stakersAllocation).div(1000),
            totalCNTAccumulated.mul(burnAllocation).div(1000),
            totalCNTAccumulated.mul(platformFeesAllocation).div(1000)
        );
        totalCNTAccumulated = 0;
    }

    function convertLP(address token0, address[] calldata pathForToken0, address token1, address[] calldata pathForToken1) external nonReentrant() {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        IPolydexPair pair = IPolydexPair(factory.getPair(token0, token1));

        require(address(pair) != address(0), "Invalid pair");

        _safeTransfer(
            address(pair),
            address(pair),
            pair.balanceOf(address(this))
        );

        pair.burn(address(this));
        // swap everything to CNT
        _swaptoCNT(token0, pathForToken0);
        _swaptoCNT(token1, pathForToken1);
        _allocateCNT();
    }

    function convertToken(address token, address[] calldata path) external nonReentrant() {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        require(address(token) != address(0), "Invalid token address");
        _swaptoCNT(token, path);
        _allocateCNT();
    }

    function _swaptoCNT(address token, address[] calldata path) internal {
        uint amountIn = IERC20(token).balanceOf(address(this));
        require(amountIn > 0, 'Contract should have token balance greater than 0');
        require(IERC20(token).approve(address(router), amountIn), 'approve failed.');
        uint amountOutMin = 1;
        uint deadline = block.timestamp + 1;
        router.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), deadline);
    }

    function _allocateCNT() internal {
        totalCNTAccumulated = IERC20(cnt).balanceOf(address(this));
        _safeTransfer(
            address(cnt),
            cntStaker,
            totalCNTAccumulated.mul(stakersAllocation).div(1000)
        );
        _safeTransfer(
            address(cnt),
            l2Burner,
            totalCNTAccumulated.mul(burnAllocation).div(1000)
        );
        _safeTransfer(
            address(cnt),
            platformAddr,
            totalCNTAccumulated.mul(platformFeesAllocation).div(1000)
        );
        emit CNTConverted(
            totalCNTAccumulated.mul(stakersAllocation).div(1000),
            totalCNTAccumulated.mul(burnAllocation).div(1000),
            totalCNTAccumulated.mul(platformFeesAllocation).div(1000)
        );
        totalCNTAccumulated = 0;
    }

    // Converts token passed as an argument to WMATIC
    function _toWMATIC(address token) internal returns (uint256) {
        // If the passed token is CryptionToken, don't convert anything
        if (token == address(cnt)) {
            uint256 amount = IERC20(token).balanceOf(address(this));
            _safeTransfer(
                token,
                cntStaker,
                amount.mul(stakersAllocation).div(1000)
            );
            _safeTransfer(
                token,
                l2Burner,
                amount.mul(burnAllocation).div(1000)
            );
            _safeTransfer(
                token,
                platformAddr,
                amount.mul(platformFeesAllocation).div(1000)
            );
            totalCNTAccumulated += amount;
            return 0;
        }
        // If the passed token is WMATIC, don't convert anything
        if (token == wmatic) {
            uint256 amount = IERC20(token).balanceOf(address(this));
            _safeTransfer(token, factory.getPair(wmatic, address(cnt)), amount);
            return amount;
        }
        // Revert transaction if the target pair doesn't exist
        IPolydexPair pair = IPolydexPair(factory.getPair(token, wmatic));
        require(address(pair) != address(0),"Cannot be converted");

        // Choose the correct reserve to swap from
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        address token0 = pair.token0();
        (uint256 reserveIn, uint256 reserveOut) = token0 == token
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        // Calculate information required to swap
        uint256 amountIn = IERC20(token).balanceOf(address(this));
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        uint256 amountOut = numerator / denominator;
        (uint256 amount0Out, uint256 amount1Out) = token0 == token
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        // Swap the token for WMATIC
        _safeTransfer(token, address(pair), amountIn);
        pair.swap(
            amount0Out,
            amount1Out,
            factory.getPair(wmatic, address(cnt)),
            new bytes(0)
        );
        return amountOut;
    }

    // Converts WMATIC to CryptionToken
    function _toCNT(uint256 amountIn) internal {
        IPolydexPair pair = IPolydexPair(factory.getPair(wmatic, address(cnt)));
        // Choose WMATIC as input token
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        address token0 = pair.token0();
        (uint256 reserveIn, uint256 reserveOut) = token0 == wmatic
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        // Calculate information required to swap
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        uint256 amountOut = numerator / denominator;
        (uint256 amount0Out, uint256 amount1Out) = token0 == wmatic
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        // Swap WMATIC for CryptionToken
        pair.swap(amount0Out, amount1Out, address(this), new bytes(0));
        _safeTransfer(
            address(cnt),
            cntStaker,
            amountOut.mul(stakersAllocation).div(1000)
        );
        _safeTransfer(
            address(cnt),
            l2Burner,
            amountOut.mul(burnAllocation).div(1000)
        );
        _safeTransfer(
            address(cnt),
            platformAddr,
            amountOut.mul(platformFeesAllocation).div(1000)
        );
        totalCNTAccumulated += amountOut;
    }

    // Wrapper for safeTransfer
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueFunds(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        IERC20(token).safeTransfer(owner(), balance);
    }
}
