const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;
const BN = require("bignumber.js");
const { advanceBlockTo } = require("../utilities/time");

describe("StakingPool", function async() {
  const depositAmount = BigNumber.from("10000000000000000");

  let lpTokenInstance,
    stakingPoolInstance,
    depositor1,
    owner,
    accounts,
    rewardToken1Instance,
    initParams;

  let initialBlockNumber, endBlockNumber;

  beforeEach(async () => {
    accounts = await ethers.getSigners();

    owner = accounts[0];
    depositor1 = accounts[1];

    const MockToken = await ethers.getContractFactory("ERC20Mock");

    lpTokenInstance = await MockToken.connect(depositor1).deploy(
      "LPTT",
      "LP Test Token",
      "100000000000000000000000000000"
    );

    rewardToken1Instance = await MockToken.connect(owner).deploy(
      "RT1",
      "Reward Token 1",
      "100000000000000000000000000000"
    );

    rewardToken2Instance = await MockToken.connect(owner).deploy(
      "RT2",
      "Reward Token 2",
      "100000000000000000000000000000"
    );

    const StakingPool = await ethers.getContractFactory("StakingPool");
    stakingPoolInstance = await StakingPool.deploy(owner.address);

    initialBlockNumber = BigNumber.from(await ethers.provider.getBlockNumber());
    endBlockNumber = initialBlockNumber.add(1000);

    initParams = {
      rewardToken: rewardToken1Instance.address,
      amount: "1000000000000000000000",
      lpToken: lpTokenInstance.address,
      blockReward: "100000000000000",
      startBlock: initialBlockNumber,
      endBlock: endBlockNumber,
      withdrawalFeeBP: 10,
      harvestInterval: 10,
    };

    await rewardToken1Instance
      .connect(owner)
      .approve(stakingPoolInstance.address, initParams.amount);
    // initialize
    await stakingPoolInstance
      .connect(owner)
      .init(
        initParams.rewardToken,
        initParams.amount,
        initParams.lpToken,
        initParams.blockReward,
        initParams.startBlock,
        initParams.endBlock,
        initParams.withdrawalFeeBP,
        initParams.harvestInterval
      );
  });

  it("should sucessfully withdraw reward", async function () {
    await lpTokenInstance
      .connect(depositor1)
      .approve(stakingPoolInstance.address, depositAmount);
    await stakingPoolInstance.connect(depositor1).deposit(depositAmount);

    const currentBlockNumber = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );
    const blocksToAdvance = currentBlockNumber.add(50);

    await advanceBlockTo(blocksToAdvance);
    await stakingPoolInstance.connect(depositor1).withdraw(depositAmount);

    const balanceOfDepositor = await rewardToken1Instance.balanceOf(
      depositor1.address
    );
    // We have advanced 50-blocks. So rewards for 51 blocks is calculated
    // Reward for 1-block is "100000000000000". So rewards for 51 blocks would be 5100000000000000.
    expect(balanceOfDepositor).to.equal("5100000000000000");
  });

  it("should sucessfully withdraw reward when 2 reward tokens are present", async function () {
    await lpTokenInstance
      .connect(depositor1)
      .approve(stakingPoolInstance.address, depositAmount);
    await stakingPoolInstance.connect(depositor1).deposit(depositAmount);

    const currentBlockNumber = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );
    const blocksToAdvance = currentBlockNumber.add(50);

    const lastRewardBlock = blocksToAdvance.add(100);

    await rewardToken2Instance
      .connect(owner)
      .approve(stakingPoolInstance.address, initParams.amount);

    await stakingPoolInstance
      .connect(owner)
      .addRewardToken(
        rewardToken2Instance.address,
        lastRewardBlock,
        "200000000000000",
        "1000000000000000000000"
      );

    await advanceBlockTo(lastRewardBlock.add(5));
    await stakingPoolInstance.connect(depositor1).withdraw(depositAmount);

    const balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor1.address
    );
    const balanceOfDepositorForReward2 = await rewardToken2Instance.balanceOf(
      depositor1.address
    );

    expect(balanceOfDepositorForReward1).to.equal("15600000000000000");

    // 2nd reward token :
    // We have advanced 5-blocks. So rewards for 6 blocks is calculated
    // Reward for 1-block is "200000000000000". So rewards for 6 blocks would be 1200000000000000.
    expect(balanceOfDepositorForReward2).to.equal("1200000000000000");
  });

  it("should lock up rewards", async function () {
    await lpTokenInstance
      .connect(depositor1)
      .approve(stakingPoolInstance.address, depositAmount);
    await stakingPoolInstance.connect(depositor1).deposit(depositAmount);

    await stakingPoolInstance.connect(depositor1).withdraw(depositAmount);

    const balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor1.address
    );

    // As withdrawal is called within harvest interval, no rewards is given.
    expect(balanceOfDepositorForReward1).to.equal("0");
  });

  it("should whiltelist user to withdraw", async function () {
    await lpTokenInstance
      .connect(depositor1)
      .approve(stakingPoolInstance.address, depositAmount);
    await stakingPoolInstance.connect(depositor1).deposit(depositAmount);

    const proxyUser = accounts[3];
    await stakingPoolInstance
      .connect(depositor1)
      .whitelistHandler(proxyUser.address);

    const currentBlockNumber = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );
    const blocksToAdvance = currentBlockNumber.add(50);
    await advanceBlockTo(blocksToAdvance);

    await stakingPoolInstance
      .connect(proxyUser)
      .withdrawFor(depositAmount, depositor1.address);

    const balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor1.address
    );
    const balanceOfProxyUserForReward1 = await rewardToken1Instance.balanceOf(
      proxyUser.address
    );

    expect(balanceOfProxyUserForReward1).to.equal("5200000000000000");
    expect(balanceOfDepositorForReward1).to.equal("0");
  });
});
