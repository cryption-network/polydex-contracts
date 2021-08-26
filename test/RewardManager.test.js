require("dotenv").config();
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceBlockTo,advanceTime } = require("./utilities/time.js");

describe("RewardManager", function () {
  before(async function () {
    const [deployer] = await ethers.getSigners();
    this.adminaddress = deployer.address;
    this.signers = await ethers.getSigners();

    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.burner = this.signers[3];
    this.dev = this.signers[4];
    this.minter = this.signers[5];

    this.RewardManagerContract = await ethers.getContractFactory("RewardManager");
    this.FarmingContract = await ethers.getContractFactory("Farm");
    this.CryptionNetworkToken = await ethers.getContractFactory(
      "MockCryptionNetworkToken"
    );
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
  });

  beforeEach(async function () {
    this.CNT = await this.CryptionNetworkToken.deploy(this.adminaddress);
    await this.CNT.deployed();
    this.provider = new ethers.providers.JsonRpcProvider();
    this.blocknumber = await this.provider.getBlockNumber();
  });

  it("should set correct state variables", async function () {
    let currentTime = parseInt(Date.now()/1000)+100;
    this.rewardManager = await this.RewardManagerContract.deploy(
      this.CNT.address,
      currentTime,
      currentTime + 86400,
      "250",
      "300",
      "200",
      this.burner.address
    );
    await this.rewardManager.deployed();

    this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        "0",
        "1000"
    );
    await this.farm.deployed();

    await this.CNT.transfer(this.farm.address, "1000000000000000000000000");

    const CNT = await this.rewardManager.cnt();
    const burner = await this.rewardManager.l2Burner();

    expect(CNT).to.equal(this.CNT.address);
    expect(burner).to.equal( this.burner.address);
  });

  context("With ERC/LP token added to the farm", function () {
    beforeEach(async function () {
        this.provider = new ethers.providers.JsonRpcProvider();
        this.blocknumber = await this.provider.getBlockNumber();
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");

      await this.lp.transfer(this.alice.address, "1000");

      await this.lp.transfer(this.bob.address, "1000");

      await this.lp.transfer(this.dev.address, "1000");

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");

      await this.lp2.transfer(this.alice.address, "1000");

      await this.lp2.transfer(this.bob.address, "1000");

      await this.lp2.transfer(this.dev.address, "1000");
    });

    it("should handle rewards for a user", async function () {
        let currentTime = parseInt(Date.now()/1000)+100;
        this.rewardManager = await this.RewardManagerContract.deploy(
          this.CNT.address,
          currentTime,
          currentTime + 86400,
            "250",
            "300",
            "200",
            this.burner.address
          );
      await this.rewardManager.deployed();

      this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "10",
        this.adminaddress,
        (this.blocknumber).toString(),
        (this.blocknumber + 100).toString()
      );
      await this.farm.deployed();
      await this.CNT.transfer(this.farm.address, "1000000000000000000000000");
      await this.farm.updateRewardManagerMode('true');
      await this.farm.updateRewardManager(this.rewardManager.address);

      await this.rewardManager.updateRewardDistributor(this.farm.address,"true");


      await this.farm.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.farm.address, "1000");

      await this.farm.connect(this.bob).deposit(0, "100");

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900");
      await advanceBlockTo(this.blocknumber + 10);
      await this.farm.connect(this.bob).deposit(0, '0');
      expect(await this.rewardManager.vestedAmount(this.bob.address)).to.not.equal(0);
    });

    it("should vest correct rewards of user", async function () {
        let currentTime = parseInt(Date.now()/1000)+1000;
        this.rewardManager = await this.RewardManagerContract.deploy(
          this.CNT.address,
          currentTime,
          currentTime + 86400,
            "250",
            "300",
            "200",
            this.burner.address
          );
      await this.rewardManager.deployed();

      this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "10",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.farm.deployed();

      await this.CNT.transfer(this.farm.address, "1000000000000000000000000");
      await this.farm.updateRewardManagerMode('true');
      await this.farm.updateRewardManager(this.rewardManager.address);

      await this.rewardManager.updateRewardDistributor(this.farm.address,"true");
      await this.farm.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.farm.address, "1000");
      await this.farm.connect(this.bob).deposit(0, "100");
      await advanceBlockTo(this.blocknumber + 105);
      let rewardsPending = parseFloat(await this.farm.pendingCNT(0,this.bob.address))+10;
      await this.farm.connect(this.bob).deposit(0, "0"); 
      let upfrontUnlockPercentage = parseInt(await this.rewardManager.upfrontUnlock());
      let upfrontUnlockAmount = (rewardsPending*upfrontUnlockPercentage)/(1000);
      let vestedAmount = rewardsPending-upfrontUnlockAmount;
      expect(parseFloat(await this.rewardManager.vestedAmount(this.bob.address))).to.equal(vestedAmount);
      expect(parseFloat(await this.CNT.balanceOf(this.bob.address))).to.equal(upfrontUnlockAmount);
    });

    it("should be able to drawDown the rewards", async function () {
        let currentTime = parseInt(Date.now()/1000)+1000;
        this.rewardManager = await this.RewardManagerContract.deploy(
            this.CNT.address,
            currentTime,
            currentTime + 86400,
              "250",
              "300",
              "200",
              this.burner.address
            );
        await this.rewardManager.deployed();
  
        this.farm = await this.FarmingContract.deploy(
          this.CNT.address,
          "10",
          this.adminaddress,
          (this.blocknumber + 200).toString(),
          (this.blocknumber + 1000).toString()
        );
        await this.farm.deployed();
  
        await this.CNT.transfer(this.farm.address, "1000000000000000000000000");
        await this.farm.updateRewardManagerMode('true');
        await this.farm.updateRewardManager(this.rewardManager.address);
  
        await this.rewardManager.updateRewardDistributor(this.farm.address,"true");
        await this.farm.add("100", this.lp.address, 0, 0, true);
  
        await this.lp.connect(this.bob).approve(this.farm.address, "1000");
        await this.farm.connect(this.bob).deposit(0, "100");
        await advanceBlockTo(this.blocknumber + 205);
        let rewardsPending = parseFloat(await this.farm.pendingCNT(0,this.bob.address))+10;
        await this.farm.connect(this.bob).deposit(0, "0"); 
        await advanceTime(43200);
        let vestingInfo = await this.rewardManager.vestingInfo(this.bob.address);
        let claimableAmount = parseInt(vestingInfo[3]);
        await this.rewardManager.connect(this.bob).drawDown();
        let upfrontUnlockPercentage = parseInt(await this.rewardManager.upfrontUnlock());
        let upfrontUnlockAmount = (rewardsPending*upfrontUnlockPercentage)/(1000);
        expect(parseFloat(await this.CNT.balanceOf(this.bob.address))).to.equal(upfrontUnlockAmount+claimableAmount);

    });

    it("user could able to prematurely Withdraw", async function () {
        let currentTime = parseInt(Date.now()/1000)+86400;
        this.rewardManager = await this.RewardManagerContract.deploy(
            this.CNT.address,
            currentTime,
            currentTime + 86400,
              "250",
              "300",
              "200",
              this.burner.address
            );
        await this.rewardManager.deployed();
  
        this.farm = await this.FarmingContract.deploy(
          this.CNT.address,
          "10",
          this.adminaddress,
          (this.blocknumber + 300).toString(),
          (this.blocknumber + 1000).toString()
        );
        await this.farm.deployed();
  
        await this.CNT.transfer(this.farm.address, "1000000000000000000000000");
        await this.farm.updateRewardManagerMode('true');
        await this.farm.updateRewardManager(this.rewardManager.address);
  
        await this.rewardManager.updateRewardDistributor(this.farm.address,"true");
        await this.farm.add("100", this.lp.address, 0, 0, true);
  
        await this.lp.connect(this.bob).approve(this.farm.address, "1000");
        await this.farm.connect(this.bob).deposit(0, "100");
        await advanceBlockTo(this.blocknumber + 305);
        let rewardsPending = parseFloat(await this.farm.pendingCNT(0,this.bob.address))+10;
        await this.farm.connect(this.bob).deposit(0, "0"); 
        let vestedAmount = await this.rewardManager.vestedAmount(this.bob.address);
        await this.rewardManager.connect(this.bob).preMatureDraw();
        let upfrontUnlockPercentage = parseInt(await this.rewardManager.upfrontUnlock());
        let preMaturePenaltyPercentage = parseInt(await this.rewardManager.preMaturePenalty());
        let upfrontUnlockAmount = (rewardsPending*upfrontUnlockPercentage)/(1000);
        let burnableAmount = (vestedAmount*preMaturePenaltyPercentage)/(1000);
        let withdrawableAmount = vestedAmount-burnableAmount;
        expect(parseFloat(await this.CNT.balanceOf(this.bob.address))).to.equal(Math.ceil(upfrontUnlockAmount+withdrawableAmount));

        });
  });
});
