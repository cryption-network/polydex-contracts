// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./polydex/interfaces/IPolydexFactory.sol";
import "./polydex/interfaces/IPolydexRouter.sol";
import "./polydex/interfaces/IPolydexPair.sol";

contract ConverterV3 is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeMath for uint16;
    using SafeERC20 for IERC20;
    using Address for address;

    struct TokenInfo {
        IERC20 token; // Address of the token contract.
        address[] pathToCNT;
        IPolydexRouter router;
    }

    struct ChildTokenInfo {
        IERC20 childToken; // Address of the child token contract.
        address[] pathToCommonToken;
        IPolydexRouter router;
    }

    struct LPTokenInfo {
        IERC20 lpToken; // Address of the LP token contract.
    }

    // The Cryption Network TOKEN!
    IERC20 public cnt;

    TokenInfo[] public tokenInfo;
    mapping(IERC20 => uint256) public tokenIndexes;

    ChildTokenInfo[] public childTokenInfo;
    mapping(IERC20 => uint256) public childTokenIndexes;

    LPTokenInfo[] public lpTokenInfo;
    mapping(IERC20 => uint256) public lpTokenIndexes;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    event CNTConverted();

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidRouter(IPolydexRouter router) {
        require(address(router) != address(0), "No zero address");
        require(
            address(IPolydexFactory(router.factory())) != address(0),
            "Invalid Factory address"
        );
        _;
    }

    modifier validateToken(IERC20 token) {
        require(
            tokenIndexes[token] < tokenInfo.length && tokenIndexes[token] > 0,
            "Token does not exist"
        );
        _;
    }

    modifier validateChildToken(IERC20 childToken) {
        require(
            childTokenIndexes[childToken] < childTokenInfo.length &&
                childTokenIndexes[childToken] > 0,
            "Child Token does not exist"
        );
        _;
    }

    modifier validateLPToken(IERC20 lpToken) {
        require(
            lpTokenIndexes[lpToken] < lpTokenInfo.length &&
                lpTokenIndexes[lpToken] > 0,
            "LP Token does not exist"
        );
        _;
    }

    constructor(IERC20 _cnt) {
        cnt = _cnt;
        //Filling filler tokens
        address[] memory path = new address[](2);
        tokenInfo.push(
            TokenInfo({
                token: IERC20(address(0)),
                pathToCNT: path,
                router: IPolydexRouter(address(0))
            })
        );
        childTokenInfo.push(
            ChildTokenInfo({
                childToken: IERC20(address(0)),
                pathToCommonToken: path,
                router: IPolydexRouter(address(0))
            })
        );
        lpTokenInfo.push(LPTokenInfo({lpToken: IERC20(address(0))}));
    }

    //Only Owner Functions

    /**
     * @notice Update CNT address
     * @param _cnt CNT token address
     */
    function updateCNT(IERC20 _cnt)
        external
        onlyOwner
        ensureNonZeroAddress(address(_cnt))
    {
        cnt = _cnt;
    }

    function addTokenDetails(
        IERC20 _token,
        address[] calldata _pathToCNT,
        IPolydexRouter _router
    )
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        ensureValidRouter(_router)
    {
        require(tokenIndexes[_token] == 0, "Token Already Added");
        require(
            address(_token) != address(cnt),
            "Token Address should not be CNT"
        );
        require(_pathToCNT.length >= 2, "Path to CNT is incorrrect/empty");
        require(
            _pathToCNT[_pathToCNT.length - 1] == address(cnt),
            "Path should convert to CNT"
        );

        tokenIndexes[_token] = tokenInfo.length;
        tokenInfo.push(
            TokenInfo({token: _token, pathToCNT: _pathToCNT, router: _router})
        );
    }

    function updateTokenPathToCNT(IERC20 _token, address[] calldata _pathToCNT)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        require(_pathToCNT.length >= 2, "Path to CNT is incorrrect/empty");
        require(
            _pathToCNT[_pathToCNT.length - 1] == address(cnt),
            "Path should convert to CNT"
        );

        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        tokenDetails.pathToCNT = _pathToCNT;
    }

    function updateTokenRouter(IERC20 _token, IPolydexRouter _router)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        ensureValidRouter(_router)
        validateToken(_token)
    {
        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        tokenDetails.router = _router;
    }

    function addChildTokenDetails(
        IERC20 _childToken,
        address[] calldata _pathToCommonToken,
        IPolydexRouter _router
    )
        external
        onlyOwner
        ensureNonZeroAddress(address(_childToken))
        ensureValidRouter(_router)
    {
        require(
            childTokenIndexes[_childToken] == 0,
            "Child Token Already Added"
        );
        require(
            address(_childToken) != address(cnt),
            "Token Address should not be CNT"
        );
        require(
            _pathToCommonToken.length >= 2,
            "Path to common token is incorrrect/empty"
        );

        childTokenIndexes[_childToken] = childTokenInfo.length;
        childTokenInfo.push(
            ChildTokenInfo({
                childToken: _childToken,
                pathToCommonToken: _pathToCommonToken,
                router: _router
            })
        );
    }

    function updateChildTokenPathToCommonToken(
        IERC20 _childToken,
        address[] calldata _pathToCommonToken
    )
        external
        onlyOwner
        ensureNonZeroAddress(address(_childToken))
        validateChildToken(_childToken)
    {
        require(
            _pathToCommonToken.length >= 2,
            "Path to common token is incorrrect/empty"
        );

        ChildTokenInfo storage childTokenDetails = childTokenInfo[
            childTokenIndexes[_childToken]
        ];
        childTokenDetails.pathToCommonToken = _pathToCommonToken;
    }

    function updateChildTokenRouter(IERC20 _childToken, IPolydexRouter _router)
        external
        onlyOwner
        ensureNonZeroAddress(address(_childToken))
        ensureValidRouter(_router)
        validateChildToken(_childToken)
    {
        ChildTokenInfo storage childTokenDetails = childTokenInfo[
            childTokenIndexes[_childToken]
        ];
        childTokenDetails.router = _router;
    }

    function addLPTokenDetails(IERC20 _lpToken)
        external
        onlyOwner
        ensureNonZeroAddress(address(_lpToken))
    {
        require(
            address(_lpToken) != address(cnt),
            "Token Address should not be CNT"
        );
        require(lpTokenIndexes[_lpToken] == 0, "LP Token Already Added");

        lpTokenIndexes[_lpToken] = lpTokenInfo.length;
        lpTokenInfo.push(LPTokenInfo({lpToken: _lpToken}));
    }

    function rescueFunds(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        IERC20(token).safeTransfer(owner(), balance);
    }

    //View Functions

    function totalTokens() external view returns (uint256) {
        return tokenInfo.length;
    }

    function totalChildTokens() external view returns (uint256) {
        return childTokenInfo.length;
    }

    function totalLPTokens() external view returns (uint256) {
        return lpTokenInfo.length;
    }

    //Public Functions

    function convertToken(IERC20 _token)
        external
        nonReentrant
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        address[] memory pathToCNT = tokenDetails.pathToCNT;
        if (tokenDetails.token.balanceOf(address(this)) > 0) {
            require(
                pathToCNT[pathToCNT.length - 1] == address(cnt),
                "Token should only be swapped to CNT"
            );
            _swapToken(
                address(tokenDetails.token),
                pathToCNT,
                tokenDetails.router
            );
            _allocateCNT();
        }
    }

    /**
    @notice convertTokens is used to convert tokens received by the converter contract to CNT.
    It uses the Router to convert the ERC20 tokens to CNT. The CNT accumulated is used to allocate to different contracts as per their allocation share.
    */
    function convertTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        for (uint256 i = 1; i < tokenInfo.length; i++) {
            TokenInfo storage tokenDetails = tokenInfo[i];
            address[] memory pathToCNT = tokenDetails.pathToCNT;
            if (tokenDetails.token.balanceOf(address(this)) > 0) {
                require(
                    pathToCNT[pathToCNT.length - 1] == address(cnt),
                    "Token should only be swapped to CNT"
                );
                _swapToken(
                    address(tokenDetails.token),
                    pathToCNT,
                    tokenDetails.router
                );
            }
        }
        _allocateCNT();
    }

    /**
    @notice convertChildToken is used to convert child tokens received by the converter contract to the token provided in the path.
    */
    function convertChildToken(IERC20 _childToken)
        public
        nonReentrant
        ensureNonZeroAddress(address(_childToken))
        validateChildToken(_childToken)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        ChildTokenInfo storage childTokenDetails = childTokenInfo[
            childTokenIndexes[_childToken]
        ];
        if (childTokenDetails.childToken.balanceOf(address(this)) > 0) {
            _swapToken(
                address(childTokenDetails.childToken),
                childTokenDetails.pathToCommonToken,
                childTokenDetails.router
            );
        }
    }

    /**
    @notice convertChildToken is used to convert child tokens received by the converter contract to the token provided in the path.
    */
    function convertChildTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        for (uint256 i = 1; i < childTokenInfo.length; i++) {
            ChildTokenInfo storage childTokenDetails = childTokenInfo[i];
            if (childTokenDetails.childToken.balanceOf(address(this)) > 0) {
                _swapToken(
                    address(childTokenDetails.childToken),
                    childTokenDetails.pathToCommonToken,
                    childTokenDetails.router
                );
            }
        }
    }

    function convertLPToken(IERC20 _lpToken)
        public
        nonReentrant
        ensureNonZeroAddress(address(_lpToken))
        validateLPToken(_lpToken)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        LPTokenInfo storage lpTokenDetails = lpTokenInfo[
            lpTokenIndexes[_lpToken]
        ];
        if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
            IPolydexPair pair = IPolydexPair(address(lpTokenDetails.lpToken));
            require(address(pair) != address(0), "Invalid pair");
            _safeTransfer(
                address(pair),
                address(pair),
                pair.balanceOf(address(this))
            );
            pair.burn(address(this));
        }
    }

    function convertLPTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        for (uint256 i = 1; i < lpTokenInfo.length; i++) {
            LPTokenInfo storage lpTokenDetails = lpTokenInfo[i];
            if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
                IPolydexPair pair = IPolydexPair(
                    address(lpTokenDetails.lpToken)
                );
                require(address(pair) != address(0), "Invalid pair");
                _safeTransfer(
                    address(pair),
                    address(pair),
                    pair.balanceOf(address(this))
                );
                pair.burn(address(this));
            }
        }
    }

    //Internal Functions

    /**
    @notice This function is used to swap ERC20 <> ERC20
    @param token The token address to swap from.
    @param path The path to take for the token swap
    @param router The router contract to be used for the token swap
    */
    function _swapToken(
        address token,
        address[] memory path,
        IPolydexRouter router
    ) internal {
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(
            tokenBalance > 0,
            "Contract should have token balance greater than 0"
        );
        IERC20(token).safeApprove(address(router), 0);
        IERC20(token).safeApprove(address(router), tokenBalance);

        uint256 swappedAmount = router.swapExactTokensForTokens(
            tokenBalance,
            1,
            path,
            address(this),
            DEADLINE
        )[path.length - 1];

        require(swappedAmount > 0, "Error in Swapping Tokens");
    }

    /*
    Internal method used by the converter to allocate swapped/converted CNT 
    to different contracts as per their allocation share.
    */
    function _allocateCNT() internal {
        uint256 totalCNTAccumulated = IERC20(cnt).balanceOf(address(this));
        if (totalCNTAccumulated > 0) {
            emit CNTConverted();
        }
    }

    // Wrapper for safeTransfer
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        IERC20(token).safeTransfer(to, amount);
    }
}
