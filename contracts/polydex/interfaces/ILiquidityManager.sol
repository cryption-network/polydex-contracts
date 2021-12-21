interface ILiquidityManager {
    function handleDeposit(
        address token,
        uint256 amount,
        address user
    ) external returns (uint256);

    function handleWithdraw(
        address token,
        uint256 amount,
        address user
    ) external returns (uint256);
}
