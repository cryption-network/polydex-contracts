const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;
const { advanceBlockTo } = require("../utilities/time");

describe("StakingPool", function async() {
  const depositAmount = BigNumber.from("10000000000000000");

  let lpTokenInstance,
    stakingPoolInstance,
    depositor1,
    owner,
    accounts,
    rewardToken1Instance,
    initParams,
    rewardToken2Instance,
    rewardToken3Instance;

  let initialBlockNumber, endBlockNumber;

  const blockRewardForToken1 = "100000000000000",
    blockRewardForToken2 = "200000000000000",
    blockRewardForToken3 = "300000000000000";

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

    rewardToken3Instance = await MockToken.connect(owner).deploy(
      "RT3",
      "Reward Token 3",
      "100000000000000000000000000000"
    );

    const StakingPool = await ethers.getContractFactory("StakingPool");
    stakingPoolInstance = await StakingPool.deploy(owner.address);

    initialBlockNumber = BigNumber.from(await ethers.provider.getBlockNumber());
    endBlockNumber = initialBlockNumber.add(20000);

    initParams = {
      rewardToken: rewardToken1Instance.address,
      amount: "1000000000000000000000",
      lpToken: lpTokenInstance.address,
      blockReward: blockRewardForToken1,
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
        blockRewardForToken2,
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

  it("should sucessfully withdraw reward when 3 reward tokens are present", async function () {
    // Note : test also covers when 3rd reward token rewards is set to 0 after certain block-number.

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

    // 2nd token added.
    await stakingPoolInstance
      .connect(owner)
      .addRewardToken(
        rewardToken2Instance.address,
        lastRewardBlock,
        blockRewardForToken2,
        "1000000000000000000000"
      );

    const blocksAdvancedAfterSecondTokenAdded = lastRewardBlock.add(5);
    await advanceBlockTo(blocksAdvancedAfterSecondTokenAdded);

    await stakingPoolInstance.connect(depositor1).withdraw(0);

    const blockNumberAfterFirstWithdraw = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );

    let balanceOfDepositorForReward1 = await rewardToken1Instance.balanceOf(
      depositor1.address
    );
    let balanceOfDepositorForReward2 = await rewardToken2Instance.balanceOf(
      depositor1.address
    );

    const balanceReward1AfterFirstWithdraw = "15600000000000000";
    expect(balanceOfDepositorForReward1).to.equal(
      balanceReward1AfterFirstWithdraw.toString()
    );

    // 2nd reward token :
    // We have advanced 5-blocks. So rewards for 6 blocks is calculated
    // Reward for 1-block is "200000000000000". So rewards for 6 blocks would be 1200000000000000.
    const balanceReward2AfterFirstWithdraw = "1200000000000000";
    expect(balanceOfDepositorForReward2).to.equal(
      balanceReward2AfterFirstWithdraw
    );

    // 3rd reward token added
    await rewardToken3Instance
      .connect(owner)
      .approve(stakingPoolInstance.address, initParams.amount);
    const thirdRewardTokenLastRewardBlock = BigNumber.from(
      await ethers.provider.getBlockNumber()
    ).add(1);

    await stakingPoolInstance
      .connect(owner)
      .addRewardToken(
        rewardToken3Instance.address,
        thirdRewardTokenLastRewardBlock,
        blockRewardForToken3,
        "1000000000000000000000"
      );

    const blocksAdvancedAfterThirdRewardToken =
      thirdRewardTokenLastRewardBlock.add(10);
    await advanceBlockTo(blocksAdvancedAfterThirdRewardToken);

    let pendingRewardForReward1 = BigNumber.from(
      await stakingPoolInstance.pendingReward(depositor1.address, 0)
    );
    let pendingRewardForReward2 = BigNumber.from(
      await stakingPoolInstance.pendingReward(depositor1.address, 1)
    );
    let pendingRewardForReward3 = BigNumber.from(
      await stakingPoolInstance.pendingReward(depositor1.address, 2)
    );
    await stakingPoolInstance.connect(depositor1).withdraw(0);

    const blockNumberAfterSecondWithdraw = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );

    const expectedReward1Balance = blockNumberAfterSecondWithdraw
      .sub(blockNumberAfterFirstWithdraw)
      .mul(blockRewardForToken1)
      .add(balanceReward1AfterFirstWithdraw);
    const expectedReward2Balance = blockNumberAfterSecondWithdraw
      .sub(blockNumberAfterFirstWithdraw)
      .mul(blockRewardForToken2)
      .add(balanceReward2AfterFirstWithdraw);
    const expectedReward3Balance = blocksAdvancedAfterThirdRewardToken
      .sub(thirdRewardTokenLastRewardBlock)
      .mul(blockRewardForToken3);

    const balanceOfDepositorForReward1Withdraw2 =
      await rewardToken1Instance.balanceOf(depositor1.address);
    const balanceOfDepositorForReward2Withdraw2 =
      await rewardToken2Instance.balanceOf(depositor1.address);
    let balanceOfDepositorForReward3 = await rewardToken3Instance.balanceOf(
      depositor1.address
    );
    expect(balanceOfDepositorForReward1Withdraw2).to.equal(
      expectedReward1Balance
    );

    expect(balanceOfDepositorForReward1Withdraw2).to.equal(
      expectedReward1Balance
    );
    expect(pendingRewardForReward1.add(blockRewardForToken1)).to.equal(
      expectedReward1Balance.sub(balanceReward1AfterFirstWithdraw)
    );

    expect(balanceOfDepositorForReward2Withdraw2).to.equal(
      expectedReward2Balance
    );
    expect(pendingRewardForReward2.add(blockRewardForToken2)).to.equal(
      expectedReward2Balance.sub(balanceReward2AfterFirstWithdraw)
    );

    expect(balanceOfDepositorForReward3).to.equal(
      expectedReward3Balance.add(blockRewardForToken3)
    );
    expect(pendingRewardForReward3).to.equal(expectedReward3Balance);

    const blockNumberBeforeWithdraw3 = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );

    // Removing 3rd reward token. We would still get reward for 1-block
    await stakingPoolInstance.connect(owner).updateBlockReward(0, 2);

    let blocksAdvanced = BigNumber.from(
      await ethers.provider.getBlockNumber()
    ).add(10);
    await advanceBlockTo(blocksAdvanced);

    // const blockNumberBeforeThirdWithdraw = await BigNumber.from(await ethers.provider.getBlockNumber());
    await stakingPoolInstance.connect(depositor1).withdraw(0);

    const blockNumberAfterWithdraw3 = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );

    const balanceOfDepositorForReward1Withdraw3 =
      await rewardToken1Instance.balanceOf(depositor1.address);
    const balanceOfDepositorForReward2Withdraw3 =
      await rewardToken2Instance.balanceOf(depositor1.address);
    const balanceOfDepositorForReward3Withdraw3 =
      await rewardToken3Instance.balanceOf(depositor1.address);

    const expectedReward1Withdraw3Balance = blockNumberAfterWithdraw3
      .sub(blockNumberBeforeWithdraw3)
      .mul(blockRewardForToken1)
      .add(balanceOfDepositorForReward1Withdraw2);
    const expectedReward2Withdraw3Balance = blockNumberAfterWithdraw3
      .sub(blockNumberBeforeWithdraw3)
      .mul(blockRewardForToken2)
      .add(balanceOfDepositorForReward2Withdraw2);
    const expectedReward3Withdraw3Balance = balanceOfDepositorForReward3.add(
      BigNumber.from(blockRewardForToken3)
    );

    expect(balanceOfDepositorForReward1Withdraw3).to.equal(
      expectedReward1Withdraw3Balance
    );
    expect(balanceOfDepositorForReward2Withdraw3).to.equal(
      expectedReward2Withdraw3Balance
    );
    expect(balanceOfDepositorForReward3Withdraw3).to.equal(
      expectedReward3Withdraw3Balance
    );

    // Removing 2nd reward token. We would still get reward for 1-block
    await stakingPoolInstance.connect(owner).updateBlockReward(0, 1);

    blocksAdvanced = BigNumber.from(await ethers.provider.getBlockNumber()).add(
      10
    );
    await advanceBlockTo(blocksAdvanced);

    const depositorLpAmountBeforeWithdrawal = BigNumber.from(
      await lpTokenInstance.balanceOf(depositor1.address)
    );
    await stakingPoolInstance.connect(depositor1).withdraw(depositAmount);
    const depositorLpAmountAfterWithdrawal = BigNumber.from(
      await lpTokenInstance.balanceOf(depositor1.address)
    );

    const blockNumberAfterWithdraw4 = BigNumber.from(
      await ethers.provider.getBlockNumber()
    );

    const balanceOfDepositorForReward1Withdraw4 =
      await rewardToken1Instance.balanceOf(depositor1.address);
    const balanceOfDepositorForReward2Withdraw4 =
      await rewardToken2Instance.balanceOf(depositor1.address);
    const balanceOfDepositorForReward3Withdraw4 =
      await rewardToken3Instance.balanceOf(depositor1.address);

    const expectedReward1Withdraw4Balance = blockNumberAfterWithdraw4
      .sub(blockNumberBeforeWithdraw3)
      .mul(blockRewardForToken1)
      .add(balanceOfDepositorForReward1Withdraw2);
    const expectedReward2Withdraw4Balance =
      balanceOfDepositorForReward2Withdraw3.add(
        BigNumber.from(blockRewardForToken2)
      );
    const expectedReward3Withdraw4Balance = expectedReward3Withdraw3Balance;

    expect(balanceOfDepositorForReward1Withdraw4).to.equal(
      expectedReward1Withdraw4Balance
    );
    expect(balanceOfDepositorForReward2Withdraw4).to.equal(
      expectedReward2Withdraw4Balance
    );
    expect(balanceOfDepositorForReward3Withdraw4).to.equal(
      expectedReward3Withdraw4Balance
    );

    const differeneceInDepositorBalance = depositorLpAmountAfterWithdrawal.sub(
      depositorLpAmountBeforeWithdrawal
    );

    const totalFees = BigNumber.from(depositAmount)
      .mul(initParams.withdrawalFeeBP)
      .div(10000);
    // Depositor lp balance is deposited amount - fees
    expect(differeneceInDepositorBalance).to.equal(
      depositAmount.sub(totalFees)
    );

    // Fees to owner address
    const lpBalanceOfOwner = await lpTokenInstance.balanceOf(owner.address);
    expect(lpBalanceOfOwner).to.equal(totalFees);
  });

  it("deposit withdraw deposit", async function () {
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

    await lpTokenInstance
      .connect(depositor1)
      .approve(stakingPoolInstance.address, depositAmount);
    await stakingPoolInstance.connect(depositor1).deposit(depositAmount);
  });
});
