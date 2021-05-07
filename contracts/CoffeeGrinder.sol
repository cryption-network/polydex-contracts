
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./uniswapv2/interfaces/IUniswapV2ERC20.sol";
import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import './CryptionNetworkToken.sol';

// CoffeeGrinder is MasterChef's left hand and kinda a wizard. He can create up CNT from pretty much anything!
// This contract handles "serving up" rewards for xCNT holders by trading tokens collected from fees for CNT.

contract CoffeeGrinder is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IUniswapV2Factory public factory;
    address public coffeeTable;
    // The CNT TOKEN!
    CryptionNetworkToken public cnt;
    address public wmatic;
    uint16 public burnAllocation;
    uint16 public stakersAllocation;
    uint16 public platformFeesAllocation;
    address public platformAddr;
    uint256 private totalCNTAccumulated;
        
    event CNTAccumulated(uint256 stakersAllocated,uint256 burnt,uint256 platformFees);
    
    constructor(IUniswapV2Factory _factory,
                address _coffeeTable,
                CryptionNetworkToken _cnt,
                address _wmatic,
                uint16 _burnAllocation,
                uint16 _stakersAllocation,
                uint16 _platformFeesAllocation,
                address _platformAddr) public {
        factory = _factory;
        cnt = _cnt;
        coffeeTable = _coffeeTable;
        wmatic = _wmatic;
        burnAllocation = _burnAllocation;
        stakersAllocation = _stakersAllocation;
        platformFeesAllocation = _platformFeesAllocation;
        platformAddr = _platformAddr;
    }

    // Set the allocation to handle accumulated swap fees 
    function setAllocation(uint16 _burnAllocation, uint16 _stakersAllocation, uint16 _platformFeesAllocation) external onlyOwner {
        require (_burnAllocation + _stakersAllocation + _platformFeesAllocation == 1000, 'invalid allocations');
        burnAllocation = _burnAllocation;
        stakersAllocation = _stakersAllocation;
        platformFeesAllocation = _platformFeesAllocation;
    }
    
    function updateCoffeeTable(address _newCoffeeTable) external onlyOwner {
        require (_newCoffeeTable != address(0), 'Address cant be zero Address');
        coffeeTable = _newCoffeeTable;
    }
    
    function convert(address token0, address token1) public {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(token0, token1));
        pair.transfer(address(pair), pair.balanceOf(address(this)));
        pair.burn(address(this));
        // First we convert everything to WMATIC
        uint256 wmaticAmount = _toWMATIC(token0) + _toWMATIC(token1);
        // Then we convert the WMATIC to CryptionToken
        _toCNT(wmaticAmount);
        emit CNTAccumulated(totalCNTAccumulated.mul(stakersAllocation).div(1000),
                            totalCNTAccumulated.mul(burnAllocation).div(1000),
                            totalCNTAccumulated.mul(platformFeesAllocation).div(1000));
        totalCNTAccumulated = 0;
    }

    // Converts token passed as an argument to WMATIC
    function _toWMATIC(address token) internal returns (uint256) {
        // If the passed token is CryptionToken, don't convert anything
        if (token == address(cnt)) {
            uint amount = IERC20(token).balanceOf(address(this)); 
            _safeTransfer(token, coffeeTable, amount.mul(stakersAllocation).div(1000));
            cnt.burn(amount.mul(burnAllocation).div(1000));
            _safeTransfer(token, platformAddr, amount.mul(platformFeesAllocation).div(1000));
            totalCNTAccumulated+=amount ;
            return 0;
        }
        // If the passed token is WMATIC, don't convert anything
        if (token == wmatic) {
            uint amount = IERC20(token).balanceOf(address(this));
            _safeTransfer(token, factory.getPair(wmatic, address(cnt)), amount);
            return amount;
        }
        // If the target pair doesn't exist, don't convert anything
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(token, wmatic));
        if (address(pair) == address(0)) {
            return 0;
        }
        // Choose the correct reserve to swap from
        (uint reserve0, uint reserve1,) = pair.getReserves();
        address token0 = pair.token0();
        (uint reserveIn, uint reserveOut) = token0 == token ? (reserve0, reserve1) : (reserve1, reserve0);
        // Calculate information required to swap
        uint amountIn = IERC20(token).balanceOf(address(this));
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        uint amountOut = numerator / denominator;
        (uint amount0Out, uint amount1Out) = token0 == token ? (uint(0), amountOut) : (amountOut, uint(0));
        // Swap the token for WMATIC
        _safeTransfer(token, address(pair), amountIn);
        pair.swap(amount0Out, amount1Out, factory.getPair(wmatic, address(cnt)), new bytes(0));
        return amountOut;
    }
    
    // Converts WMATIC to CryptionToken
    function _toCNT(uint256 amountIn) internal {
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(wmatic, address(cnt)));
        // Choose WMATIC as input token
        (uint reserve0, uint reserve1,) = pair.getReserves();
        address token0 = pair.token0();
        (uint reserveIn, uint reserveOut) = token0 == wmatic ? (reserve0, reserve1) : (reserve1, reserve0);
        // Calculate information required to swap
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        uint amountOut = numerator / denominator;
        (uint amount0Out, uint amount1Out) = token0 == wmatic ? (uint(0), amountOut) : (amountOut, uint(0));
        // Swap WMATIC for CryptionToken
        pair.swap(amount0Out, amount1Out, address(this), new bytes(0));
        _safeTransfer(address(cnt), coffeeTable, amountOut.mul(stakersAllocation).div(1000));
        cnt.burn(amountOut.mul(burnAllocation).div(1000));
        _safeTransfer(address(cnt), platformAddr, amountOut.mul(platformFeesAllocation).div(1000));
        totalCNTAccumulated+=amountOut;
    }

    // Wrapper for safeTransfer
    function _safeTransfer(address token, address to, uint256 amount) internal {
        IERC20(token).safeTransfer(to, amount);
    }
}
