const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { advanceBlock, advanceTime } = require("../utilities/time");
const { getBigNumber } = require("../utilities/index");
const rewardManagerByteCode = require("../../artifacts/contracts/RewardManager.sol/RewardManager.json")
  .bytecode;

const ERC20TokensSupply = getBigNumber(10 ** 6);

describe("Reward Manager Factory Contract", function() {
  before(async function() {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const CryptionNetworkToken = await ethers.getContractFactory("ERC20Mock");
    this.cntTokenInstance = await CryptionNetworkToken.deploy(
      "CNT",
      "CNT",
      ERC20TokensSupply
    );
    await this.cntTokenInstance.deployed();

    console.log("CNT Token Deployed at", this.cntTokenInstance.address);

    const RewardManagerFactory = await ethers.getContractFactory(
      "RewardManagerFactory"
    );

    this.rewardManagerFactory = await RewardManagerFactory.deploy(
      this.cntTokenInstance.address
    );
    await this.rewardManagerFactory.deployed();

    console.log(
      "Reward Manager Factory Deployed at",
      this.rewardManagerFactory.address
    );

    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const startDistribution = Number(latestBlock.timestamp) + 10;
    const endDistribution = startDistribution + 100;

    await this.rewardManagerFactory.launchRewardManager(
      this.cntTokenInstance.address,
      startDistribution,
      endDistribution,
      200,
      350,
      0,
      this.signer.address,
      rewardManagerByteCode
    );

    await this.cntTokenInstance.transfer(
      this.rewardManagerFactory.address,
      getBigNumber(400)
    );

    await this.rewardManagerFactory.updateRewardDistributor(
      this.signer.address,
      true
    );

    this.firstRewardManagerAddress = (
      await this.rewardManagerFactory.managers(0)
    ).managerAddress;

    console.log(
      "1st Reward Manager Deployed at",
      this.firstRewardManagerAddress
    );

    const RewardManager = await ethers.getContractFactory("RewardManager");

    this.firstRewardManagerInstance = await RewardManager.attach(
      this.firstRewardManagerAddress
    );

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      1,
      1,
      1
    );
  });

  it("should set correct state variables", async function() {
    const totalRewardManagers = await this.rewardManagerFactory.totalRewardManagers();
    const cnt = await this.rewardManagerFactory.cnt();
    const rewardDistributorStatus = await this.rewardManagerFactory.rewardDistributor(
      this.signer.address
    );
    const firstRewardManagerIndex = await this.rewardManagerFactory.managerIndex(
      this.firstRewardManagerAddress
    );
    const firstRewardManager = await this.rewardManagerFactory.managers(0);
    const owner = await this.rewardManagerFactory.owner();

    expect(owner).to.equal(this.signer.address);
    expect(totalRewardManagers).to.equal(1);
    expect(cnt).to.equal(this.cntTokenInstance.address);
    expect(rewardDistributorStatus).to.equal(true);
    expect(firstRewardManagerIndex).to.equal(0);
    expect(firstRewardManager.managerAddress).to.equal(
      this.firstRewardManagerAddress
    );
    expect(firstRewardManager.startDistribution).to.equal(
      await this.firstRewardManagerInstance.startDistribution()
    );
    expect(firstRewardManager.endDistribution).to.equal(
      await this.firstRewardManagerInstance.endDistribution()
    );
    expect(await this.firstRewardManagerInstance.l2Burner()).to.equal(
      this.signer.address
    );
    expect(await this.firstRewardManagerInstance.upfrontUnlock()).to.equal(200);
    expect(await this.firstRewardManagerInstance.preMaturePenalty()).to.equal(
      350
    );
    expect(await this.firstRewardManagerInstance.bonusPercentage()).to.equal(0);
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(100));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));
  });

  it("should correctly fetch vesting info", async function() {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(100));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      1,
      1,
      1
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(200));

    console.log("Users rewards are added multiple times before vesting");

    console.log(
      `User's Balance before draw down`,
      String(await this.cntTokenInstance.balanceOf(this.signer.address))
    );
    await this.rewardManagerFactory.drawDown();
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    console.log(
      `User's Balance after draw down`,
      String(await this.cntTokenInstance.balanceOf(this.signer.address))
    );

    console.log(`Don't want to wait for rewards. Force claiming.......`);
    await this.rewardManagerFactory.preMatureDraw();

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(0));

    console.log(`Pre Mature Draw Success <++>`);

    console.log(`Adding More Rewards to Reward Manager for further flow <++>`);

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      1,
      1,
      1
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    for (let i = 0; i < 2; i++) {
      advanceBlock();
    }

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    console.log("Vested Rewards Distribution Begins now");
  });

  it("should revert if handle rewards for user is called in vesting period", async function() {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    await expect(
      this.rewardManagerFactory.handleRewardsForUser(
        this.signer.address,
        getBigNumber(25),
        1,
        1,
        1
      )
    ).to.be.revertedWith("Cannot vest in distribution phase");
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    console.log(`User's vesting amount did not change in distribution period`);
  });

  it("should draw down claimable amount from first reward manager", async function() {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(1));

    console.log(
      `User should be able to claim claimable rewards of ${userTotalVestingInfo.claimable.toString()} CNT `
    );

    console.log(
      `User's CNT Balance before drawing down - ${await this.cntTokenInstance.balanceOf(
        this.signer.address
      )}`
    );

    await this.rewardManagerFactory.drawDown();

    console.log(
      `User's CNT Balance after drawing down - ${await this.cntTokenInstance.balanceOf(
        this.signer.address
      )}`
    );

    for (let i = 0; i < 50; i++) {
      advanceBlock();
    }

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(50));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(98));
  });

  it("should launch new reward manager", async function() {
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const startDistribution = Number(latestBlock.timestamp) + 10;
    const endDistribution = startDistribution + 50;

    await this.rewardManagerFactory.launchRewardManager(
      this.cntTokenInstance.address,
      startDistribution,
      endDistribution,
      200,
      350,
      0,
      this.signer.address,
      rewardManagerByteCode
    );

    this.secondRewardManagerAddress = (
      await this.rewardManagerFactory.managers(1)
    ).managerAddress;

    console.log(
      "2nd Reward Manager Deployed at",
      this.secondRewardManagerAddress
    );

    await this.rewardManagerFactory.updateRewardDistributor(
      this.signer.address,
      true
    );

    await this.cntTokenInstance.transfer(
      this.rewardManagerFactory.address,
      getBigNumber(125)
    );

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      1,
      1,
      1
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(54));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(198));

    for (let i = 0; i < 25; i++) {
      advanceBlock();
    }
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );

    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(117));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(198));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(202));
  });

  it("should draw down claimable amount from both reward managers", async function() {
    await this.rewardManagerFactory.drawDown();
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(322));
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(78));
  });

  it("should force withdraw the remaining tokens", async function() {
    await this.rewardManagerFactory.preMatureDraw();
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(9625, 16));
  });

  it("should not draw in vesting period after force claimed", async function() {
    console.log(
      `User's Balance before draw down`,
      String(await this.cntTokenInstance.balanceOf(this.signer.address))
    );
    await this.rewardManagerFactory.drawDown();
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    console.log(
      `User's Balance after draw down`,
      String(await this.cntTokenInstance.balanceOf(this.signer.address))
    );
  });
});
