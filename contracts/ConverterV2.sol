// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./polydex/interfaces/IPolydexERC20.sol";
import "./polydex/interfaces/IPolydexPair.sol";
import "./polydex/interfaces/IPolydexFactory.sol";
import "./polydex/interfaces/IPolydexRouter.sol";

// ConverterV2 is Farm's left hand and kinda a wizard. He can create up CNT from pretty much anything!
// This contract handles "serving up" rewards for xCNT holders & also burning some by trading tokens collected from fees for CNT.
// This contract differs in the way from its predecessor by directly using the Polydex Router to swap LP tokens and ERC20 tokens to CNT.

contract ConverterV2 is Ownable, ReentrancyGuard {
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

    event CNTConverted(
        uint256 stakersAllocated,
        uint256 burnt,
        uint256 platformFees
    );

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    constructor(
        IERC20 _cnt,
        uint16 _burnAllocation,
        uint16 _stakersAllocation,
        uint16 _platformFeesAllocation,
        address _platformAddr
    ) {
        cnt = _cnt;
        platformAddr = _platformAddr;
        setAllocation(
            _burnAllocation,
            _stakersAllocation,
            _platformFeesAllocation
        );
        //Set to Polydex Contract Addresses deployed on Matic Mainnet
        router = IPolydexRouter(0xBd13225f0a45BEad8510267B4D6a7c78146Be459);
        factory = IPolydexFactory(0x5BdD1CD910e3307582F213b33699e676E61deaD9);
        cntStaker = 0x82C2Fb7410dcfFEd4e9147413BD5005a0a6F58aA;
        wmatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
        l2Burner = 0x937b524174B24f0884f9FEf167d6f9cdF553B371;
    }

    // Can be used by the owner to update the address for the L2Burner
    function updateL2Burner(address _l2Burner) external onlyOwner ensureNonZeroAddress(_l2Burner) {
        l2Burner = _l2Burner;
    }

    // Can be used by the owner to update the address for the PolydexRouter
    function updateRouter(IPolydexRouter _router) external onlyOwner ensureNonZeroAddress(address(_router)) {
        router = _router;
    }

    // Can be used by the owner to update the address for the factory
    function updateFactory(IPolydexFactory _factory) external onlyOwner ensureNonZeroAddress(address(_factory)) {
        factory = _factory;
    }

     // Can be used by the owner to update the address for wmatic
    function updateWMATIC(address _wmatic) external onlyOwner ensureNonZeroAddress(_wmatic) {
        wmatic = _wmatic;
    }

    // Can be used by the owner to update the platformAddress
    function updatePlatformAddress(address _platformAddr) external onlyOwner ensureNonZeroAddress(_platformAddr)  {
        platformAddr = _platformAddr;
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

    // Can be used by the owner to update the address for the CntStaker
    function updateCntStaker(address _newCntStaker) external onlyOwner ensureNonZeroAddress(_newCntStaker) {
        cntStaker = _newCntStaker;
    }

    /*
    convertLP is used to convert LP tokens received as fees by the converter contract to CNT. It uses the PolydexRouter to convert
    the underneath tokens in the LP pair (token0 and token1) to CNT. The CNT accumulated is used to allocate to different contracts
    as per their allocation share.
    pathForToken0 requires the path that will be used by the PolydexRouter to swap the token0 to CNT.
    pathForToken1 requires the path that will be used by the PolydexRouter to swap the token1 to CNT.
    */
    function convertLP(address token0, address[] calldata pathForToken0, address token1, address[] calldata pathForToken1) external onlyOwner nonReentrant() {
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

    /*
    convertToken is used to convert ERC20 tokens received by the converter contract to CNT. It uses the PolydexRouter to convert
    the ERC20 tokens to CNT. The CNT accumulated is used to allocate to different contracts as per their allocation share.
    path param requires the path that will be used by the Router to swap the token to CNT.
    */
    function convertToken(address token, address[] calldata path) external onlyOwner nonReentrant() ensureNonZeroAddress(token) {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        _swaptoCNT(token, path);
        _allocateCNT();
    }

    /*
    Internal method used by the converter to swap any token with the path for swapping to CNT with 
    the help of PolydexRouter
    */
    function _swaptoCNT(address token, address[] calldata path) internal {
        //the path should always have CNT otherwise it will convert to the token added which would lead to loss of funds.
        if (token != address(cnt)) 
        {
            uint amountIn = IERC20(token).balanceOf(address(this));
            require(amountIn > 0, 'Contract should have token balance greater than 0');
            require(IERC20(token).approve(address(router), amountIn), 'approve failed.');
            router.swapExactTokensForTokens(amountIn, 1, path, address(this), block.timestamp + 1);
        }
    }

    /*
    Internal method used by the converter to allocate swapped/converted CNT 
    to different contracts as per their allocation share.
    */
    function _allocateCNT() internal {
        uint256 totalCNTAccumulated = IERC20(cnt).balanceOf(address(this));
        require(totalCNTAccumulated > 0, 'No CNT accumulated to allocate');
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
