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

    const startDistribution = Math.floor(Date.now() / 1000) + 10;
    const endDistribution = startDistribution + 25;

    await this.rewardManagerFactory.launchRewardManager(
      this.cntTokenInstance.address,
      startDistribution,
      endDistribution,
      250,
      350,
      150,
      this.signer.address,
      rewardManagerByteCode
    );

    await this.cntTokenInstance.transfer(
      this.rewardManagerFactory.address,
      getBigNumber(100)
    );

    await this.cntTokenInstance.approve(
      this.rewardManagerFactory.address,
      getBigNumber(100)
    );

    await this.rewardManagerFactory.addBonusRewards(0, getBigNumber(1125, 16));

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
      getBigNumber(100),
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
    expect(await this.firstRewardManagerInstance.upfrontUnlock()).to.equal(250);
    expect(await this.firstRewardManagerInstance.preMaturePenalty()).to.equal(
      350
    );
    expect(await this.firstRewardManagerInstance.bonusPercentage()).to.equal(
      150
    );
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(75));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(75));
  });

  it("should correctly fetch vesting info", async function() {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(75));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(75));
    //moving 26 seconds ahead + 4 due to the txs above - 10 remaining due to timestamp
    for (let i = 0; i < 10; i++) {
      advanceBlock();
    }
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );

    expect(Number(userTotalVestingInfo.claimable)).to.be.greaterThan(0);

    const startDistribution = Math.floor(Date.now() / 1000) + 30;
    const endDistribution = startDistribution + 25;

    await this.rewardManagerFactory.launchRewardManager(
      this.cntTokenInstance.address,
      startDistribution,
      endDistribution,
      250,
      350,
      150,
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

    await this.cntTokenInstance.transfer(
      this.rewardManagerFactory.address,
      getBigNumber(100)
    );

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(100),
      1,
      1,
      1
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(150));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(150));

    for (let i = 0; i < 25; i++) {
      advanceBlock();
    }
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );

    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(150));
    expect(Number(userTotalVestingInfo.claimable)).to.be.greaterThan(75);
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(150));
  });

  it("should draw down claimable amount", async function() {
    await this.rewardManagerFactory.drawDown();
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(Number(userTotalVestingInfo.totalDrawnAmount)).to.be.greaterThan(
      Number(getBigNumber(75))
    );
  });

  it("should force withdraw the remaining tokens", async function() {
    await this.rewardManagerFactory.preMatureDraw();
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(Number(userTotalVestingInfo.amountBurnt)).to.be.greaterThan(
      Number(getBigNumber(0))
    );
  });
});
