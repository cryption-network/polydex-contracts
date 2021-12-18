const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;
const { advanceBlockTo } = require("../utilities/time");
const { getBigNumber } = require("../utilities/index");
const ERC20TokensSupply = getBigNumber(10 ** 6);
const depositAmount = getBigNumber(100);

describe("Multi Rewards StakingPool (6 Reward Tokens)", function async() {
  let depositor,
    owner,
    accounts,
    initParams,
    lpTokenInstance,
    rewardToken1Instance,
    rewardToken2Instance,
    rewardToken3Instance,
    rewardToken4Instance,
    rewardToken5Instance,
    rewardToken6Instance,
    stakingPoolInstance,
    komTokenInstance;

  let initialBlockNumber, endBlockNumber;

  const blockRewardForToken1 = getBigNumber(1),
    blockRewardForToken2 = getBigNumber(2),
    blockRewardForToken3 = getBigNumber(3),
    blockRewardForToken4 = getBigNumber(4),
    blockRewardForToken5 = getBigNumber(5),
    blockRewardForToken6 = getBigNumber(6);

  const getRewardReserves = (number) => getBigNumber(300 * number);

  const addRewardToken = async (
    rewardTokenInstance,
    blockReward,
    initialBlockNumber,
    rewardReserves
  ) => {
    await rewardTokenInstance
      .connect(owner)
      .approve(stakingPoolInstance.address, rewardReserves);

    await stakingPoolInstance
      .connect(owner)
      .addRewardToken(
        rewardTokenInstance.address,
        initialBlockNumber,
        blockReward,
        rewardReserves
      );
  };

  const increaseBlocks = async () => {
    const currentBlockNumber = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );
    const blocksToAdvance = currentBlockNumber.add(50);
    await advanceBlockTo(blocksToAdvance);
  };

  before(async () => {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    depositor = accounts[1];

    //Deploy Tokens

    const MockToken = await ethers.getContractFactory("ERC20Mock");

    lpTokenInstance = await MockToken.connect(depositor).deploy(
      "LPTT",
      "LP Test Token",
      getBigNumber(100)
    );

    //CNT
    rewardToken1Instance = await MockToken.connect(owner).deploy(
      "RT1",
      "Reward Token 1",
      ERC20TokensSupply
    );

    rewardToken2Instance = await MockToken.connect(owner).deploy(
      "RT2",
      "Reward Token 2",
      ERC20TokensSupply
    );

    rewardToken3Instance = await MockToken.connect(owner).deploy(
      "RT3",
      "Reward Token 3",
      ERC20TokensSupply
    );

    rewardToken4Instance = await MockToken.connect(owner).deploy(
      "RT4",
      "Reward Token 4",
      ERC20TokensSupply
    );

    rewardToken5Instance = await MockToken.connect(owner).deploy(
      "RT5",
      "Reward Token 5",
      ERC20TokensSupply
    );

    const KOMToken = await ethers.getContractFactory("ERC20Mock8decimals");
    komTokenInstance = await KOMToken.connect(owner).deploy(
      "KOM",
      "Kommunitas",
      1e8 * 10 ** 6
    );

    const KOMWrapper = await ethers.getContractFactory("KOMWrapper");
    rewardToken6Instance = await KOMWrapper.connect(owner).deploy(
      komTokenInstance.address
    );

    console.log("Lp Token and Reward Tokens Deployed");

    const StakingPool = await ethers.getContractFactory("StakingPool");
    stakingPoolInstance = await StakingPool.deploy(
      owner.address,
      rewardToken1Instance.address
    );

    console.log(`Staking Pool Deployed at ${stakingPoolInstance.address}`);

    initialBlockNumber =
      (await hre.ethers.provider.getBlock("latest")).number + 15;
    endBlockNumber = initialBlockNumber + 300;

    initParams = {
      rewardToken: rewardToken1Instance.address,
      amount: getRewardReserves(1),
      lpToken: lpTokenInstance.address,
      blockReward: blockRewardForToken1,
      startBlock: initialBlockNumber,
      endBlock: endBlockNumber,
      withdrawalFeeBP: 0,
      depositFeeBP: 0,
      harvestInterval: 10,
    };

    await rewardToken1Instance
      .connect(owner)
      .approve(stakingPoolInstance.address, getRewardReserves(1));

    await stakingPoolInstance
      .connect(owner)
      .init(
        initParams.rewardToken,
        getRewardReserves(1),
        initParams.lpToken,
        initParams.blockReward,
        initParams.startBlock,
        initParams.endBlock,
        initParams.withdrawalFeeBP,
        initParams.depositFeeBP,
        initParams.harvestInterval
      );

    await addRewardToken(
      rewardToken2Instance,
      blockRewardForToken2,
      initialBlockNumber,
      getRewardReserves(2)
    );

    await addRewardToken(
      rewardToken3Instance,
      blockRewardForToken3,
      initialBlockNumber,
      getRewardReserves(3)
    );

    await addRewardToken(
      rewardToken4Instance,
      blockRewardForToken4,
      initialBlockNumber,
      getRewardReserves(4)
    );

    await addRewardToken(
      rewardToken5Instance,
      blockRewardForToken5,
      initialBlockNumber,
      getRewardReserves(5)
    );

    console.log(
      "Before Deposit KOM Balance for Signer",
      Number(await komTokenInstance.balanceOf(owner.address))
    );

    console.log(
      "Before Deposit WKOM Balance for Signer",
      Number(await rewardToken6Instance.balanceOf(owner.address))
    );

    console.log(
      "Before Deposit KOM Balance in WKOM Contract",
      Number(await komTokenInstance.balanceOf(rewardToken6Instance.address))
    );

    console.log(
      "Before Deposit KOM Balance in Staking Contract",
      Number(await komTokenInstance.balanceOf(stakingPoolInstance.address))
    );

    console.log(
      "Before Deposit WKOM Balance in Staking Contract",
      Number(await rewardToken6Instance.balanceOf(stakingPoolInstance.address))
    );

    await komTokenInstance.approve(rewardToken6Instance.address, 1e8 * 300 * 6);

    await rewardToken6Instance.deposit(1e8 * 300 * 6);

    console.log(
      "After Deposit KOM Balance for Signer",
      Number(await komTokenInstance.balanceOf(owner.address))
    );

    console.log(
      "After Deposit WKOM Balance for Signer",
      Number(await rewardToken6Instance.balanceOf(owner.address))
    );

    console.log(
      "After Deposit KOM Balance in WKOM Contract",
      Number(await komTokenInstance.balanceOf(rewardToken6Instance.address))
    );

    console.log(
      "After Deposit KOM Balance in Staking Contract",
      Number(await komTokenInstance.balanceOf(stakingPoolInstance.address))
    );

    console.log(
      "After Deposit WKOM Balance in Staking Contract",
      Number(await rewardToken6Instance.balanceOf(stakingPoolInstance.address))
    );

    await addRewardToken(
      rewardToken6Instance,
      blockRewardForToken6,
      initialBlockNumber,
      getRewardReserves(6)
    );

    console.log(
      "After reward token added KOM Balance for Signer",
      Number(await komTokenInstance.balanceOf(owner.address))
    );

    console.log(
      "After reward token added WKOM Balance for Signer",
      Number(await rewardToken6Instance.balanceOf(owner.address))
    );

    console.log(
      "After reward token added KOM Balance in WKOM Contract",
      Number(await komTokenInstance.balanceOf(rewardToken6Instance.address))
    );

    console.log(
      "After reward token added KOM Balance in Staking Contract",
      Number(await komTokenInstance.balanceOf(stakingPoolInstance.address))
    );

    console.log(
      "After reward token added WKOM Balance in Staking Contract",
      Number(await rewardToken6Instance.balanceOf(stakingPoolInstance.address))
    );

    await lpTokenInstance
      .connect(depositor)
      .approve(stakingPoolInstance.address, getBigNumber(10 ** 10));
  });

  it("should set correct state variables", async function() {
    const totalInputTokensStaked = await stakingPoolInstance.totalInputTokensStaked();
    const owner = await stakingPoolInstance.owner();
    const feeAddress = await stakingPoolInstance.feeAddress();
    const farmInfo = await stakingPoolInstance.farmInfo();
    const isInitiated = await stakingPoolInstance.isInitiated();
    const CNT = await stakingPoolInstance.CNT();

    expect(CNT).to.equal(rewardToken1Instance.address);
    expect(feeAddress).to.equal(owner);
    expect(owner).to.equal(owner);
    expect(totalInputTokensStaked).to.equal(Number(0));
    expect(isInitiated).to.equal(true);
    expect(farmInfo.numFarmers).to.equal(0);
    expect(farmInfo.inputToken).to.equal(lpTokenInstance.address);
    expect(farmInfo.depositFeeBP).to.equal(0);
  });

  it("should correctly call only owner functions", async function() {
    await stakingPoolInstance.updateRewardManagerMode(true);
    let isRewardManagerEnabled = await stakingPoolInstance.isRewardManagerEnabled();
    expect(isRewardManagerEnabled).to.equal(true);
    await stakingPoolInstance.updateRewardManagerMode(false);
    isRewardManagerEnabled = await stakingPoolInstance.isRewardManagerEnabled();
    expect(isRewardManagerEnabled).to.equal(false);
  });

  it("should return pending rewards as zero if no Lps are staked", async function() {
    const pendingRewards1 = await stakingPoolInstance.pendingReward(
      depositor.address,
      0
    );
    const pendingRewards2 = await stakingPoolInstance.pendingReward(
      depositor.address,
      0
    );
    const pendingRewards3 = await stakingPoolInstance.pendingReward(
      depositor.address,
      0
    );
    expect(pendingRewards1).to.equal(0);
    expect(pendingRewards2).to.equal(0);
    expect(pendingRewards3).to.equal(0);
  });

  it("should sucessfully deposit tokens in the staking pool", async function() {
    await stakingPoolInstance.connect(depositor).deposit(depositAmount);

    const userInfo = await stakingPoolInstance.userInfo(depositor.address);
    const totalRewardTokensStakedInStakingPool = await stakingPoolInstance.totalInputTokensStaked();

    expect(userInfo.amount).to.equal(getBigNumber(100));
    expect(totalRewardTokensStakedInStakingPool).to.equal(getBigNumber(100));
  });

  it("should increase the pending rewards for the user", async function() {
    const depositorBalanceReward1BeforeHarvest = String(
      await komTokenInstance.balanceOf(depositor.address)
    );
    console.log(
      "Depositor Balance RewardToken1 before harvest",
      depositorBalanceReward1BeforeHarvest
    );

    await increaseBlocks();

    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.greaterThan(Number(0));
      console.log(
        `Pending Reward for Reward Token ${i + 1} to claim`,
        String(pendingRewards)
      );
    }
  });

  it("should harvest rewards", async function() {
    //checking harvest by deposit 0
    const tx = await stakingPoolInstance.connect(depositor).deposit(0);
    console.log("\tGas Used:", String((await tx.wait()).gasUsed));
    const depositorBalanceReward1AfterHarvest = String(
      await komTokenInstance.balanceOf(depositor.address)
    );
    console.log(
      "Depositor Balance RewardToken1 after harvest",
      depositorBalanceReward1AfterHarvest
    );
    expect(Number(depositorBalanceReward1AfterHarvest)).to.be.greaterThan(
      Number(0)
    );

    let userInfo = await stakingPoolInstance.userInfo(depositor.address);
    let totalRewardTokensStakedInStakingPool = await stakingPoolInstance.totalInputTokensStaked();
    let rewardPool = await stakingPoolInstance.rewardPool(0);

    expect(userInfo.amount).to.equal(getBigNumber(100));
    expect(totalRewardTokensStakedInStakingPool).to.equal(getBigNumber(100));
    expect(Number(rewardPool.accRewardPerShare)).to.be.greaterThan(Number(0));

    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.equal(Number(0));
    }

    const currentBlockNumber = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );
    const blocksToAdvance = currentBlockNumber.add(10);
    await advanceBlockTo(blocksToAdvance);

    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.greaterThan(Number(0));
      console.log(
        `Pending Reward for Reward Token ${i + 1} to claim`,
        String(pendingRewards)
      );
    }

    //checking harvest by withdraw 0
    await stakingPoolInstance.connect(depositor).withdraw(0);

    userInfo = await stakingPoolInstance.userInfo(depositor.address);
    totalRewardTokensStakedInStakingPool = await stakingPoolInstance.totalInputTokensStaked();
    rewardPool = await stakingPoolInstance.rewardPool(0);

    expect(userInfo.amount).to.equal(getBigNumber(100));
    expect(totalRewardTokensStakedInStakingPool).to.equal(getBigNumber(100));
    expect(Number(rewardPool.accRewardPerShare)).to.be.greaterThan(Number(0));

    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.equal(Number(0));
    }
  });

  it("should withdraw asset and claim rewards", async function() {
    await rewardToken1Instance
      .connect(depositor)
      .transfer(
        stakingPoolInstance.address,
        rewardToken1Instance.balanceOf(depositor.address)
      );
    expect(
      Number(await rewardToken1Instance.balanceOf(depositor.address))
    ).to.equal(Number(0));
    await increaseBlocks();
    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.greaterThan(Number(0));
    }
    await stakingPoolInstance.connect(depositor).withdraw(getBigNumber(50));
    const depositorBalanceReward1AfterHarvest = String(
      await rewardToken1Instance.balanceOf(depositor.address)
    );
    expect(Number(depositorBalanceReward1AfterHarvest)).to.be.greaterThan(
      Number(0)
    );
    const userInfo = await stakingPoolInstance.userInfo(depositor.address);
    const totalRewardTokensStakedInStakingPool = await stakingPoolInstance.totalInputTokensStaked();

    expect(userInfo.amount).to.equal(getBigNumber(50));
    expect(totalRewardTokensStakedInStakingPool).to.equal(getBigNumber(50));

    for (let i = 0; i < 6; i++) {
      const pendingRewards = await stakingPoolInstance.pendingReward(
        depositor.address,
        i
      );
      expect(Number(pendingRewards)).to.be.equal(Number(0));
    }
  });

  it("should whiltelist user to withdraw", async function() {
    await rewardToken1Instance
      .connect(depositor)
      .transfer(
        stakingPoolInstance.address,
        rewardToken1Instance.balanceOf(depositor.address)
      );
    await increaseBlocks();
    const proxyUser = accounts[3];
    await stakingPoolInstance
      .connect(depositor)
      .whitelistHandler(proxyUser.address);

    await stakingPoolInstance
      .connect(proxyUser)
      .withdrawFor(getBigNumber(10), depositor.address);

    const balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor.address
    );
    const balanceOfProxyUserForReward1 = await rewardToken1Instance.balanceOf(
      proxyUser.address
    );

    expect(Number(balanceOfProxyUserForReward1)).to.be.greaterThan(Number(0));
    expect(balanceOfDepositorForReward1).to.equal("0");
  });

  it("should execute emergency withdraw from staking pool", async function() {
    const userLPBalanceBefore = await lpTokenInstance.balanceOf(
      depositor.address
    );
    await stakingPoolInstance.connect(depositor).emergencyWithdraw();
    const userInfo = await stakingPoolInstance.userInfo(depositor.address);
    const totalRewardTokensStakedInStakingPool = await stakingPoolInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(Number(0));
    expect(totalRewardTokensStakedInStakingPool).to.equal(Number(0));
    const userLPBalanceAfter = await lpTokenInstance.balanceOf(
      depositor.address
    );
    expect(userLPBalanceAfter.sub(userLPBalanceBefore)).to.equal(
      getBigNumber(40)
    );
  });

  it("should lock up rewards", async function() {
    await stakingPoolInstance.connect(depositor).deposit(getBigNumber(50));
    await stakingPoolInstance.connect(depositor).withdraw(getBigNumber(48));
    const totalLockedUpRewards = await stakingPoolInstance.totalLockedUpRewards(
      rewardToken1Instance.address
    );
    console.log("Total Locked Rewards", Number(totalLockedUpRewards));
    const balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor.address
    );
    // As withdrawal is called within harvest interval, no rewards is given.
    expect(balanceOfDepositorForReward1).to.equal("0");
    expect(Number(totalLockedUpRewards)).to.be.greaterThan(Number(0));
  });

  it("should remove reward tokens from the pool when not needed", async function() {
    const rewardToken1BalanceInPoolBefore = await rewardToken1Instance.balanceOf(
      stakingPoolInstance.address
    );
    await stakingPoolInstance.transferRewardToken(
      0,
      rewardToken1BalanceInPoolBefore
    );
    const rewardToken1BalanceInPoolAfter = await rewardToken1Instance.balanceOf(
      stakingPoolInstance.address
    );
    expect(rewardToken1BalanceInPoolAfter).to.equal(Number(0));
  });

  it("should mass update pools", async function() {
    const tx = await stakingPoolInstance.connect(depositor).massUpdatePools();
    console.log("\tGas Used:", String((await tx.wait()).gasUsed));
  });
});
