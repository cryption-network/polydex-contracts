require("dotenv").config();
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceBlockTo } = require("../utilities/time.js");

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
    this.rewardManager = await this.RewardManagerContract.deploy(
      this.CNT.address,
      Date.now(),
      Date.now() + 86400,
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

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.provider = new ethers.providers.JsonRpcProvider();
      this.blocknumber = await this.provider.getBlockNumber();
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");

      await this.lp.transfer(this.alice.address, "1000");

      await this.lp.transfer(this.bob.address, "1000");

      await this.lp.transfer(this.carol.address, "1000");

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");

      await this.lp2.transfer(this.alice.address, "1000");

      await this.lp2.transfer(this.bob.address, "1000");

      await this.lp2.transfer(this.carol.address, "1000");

      await this.farm.updateRewardManagerMode('true');

      await this.farm.updateRewardManager(this.RewardManagerContract.address);
    });

    it("should handle rewards for a user", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "100",
        this.adminaddress,
        "100",
        "1000"
      );
      await this.farm.deployed();

      await this.farm.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.farm.address, "1000");

      await this.farm.connect(this.bob).deposit(0, "100");

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900");

      await this.farm.connect(this.bob).deposit(0, '0');

      expect(await this.rewardManager.vestedAmount(this.bob.address)).to.not.equal("0");
    });

    it("user should be able to drawDown the rewards", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.farm.deployed();

      await this.CNT.transfer(this.farm.address, "1000000000000000000000000");

      await this.farm.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.farm.address, "1000");
      await this.farm.connect(this.bob).deposit(0, "100");
      await advanceBlockTo(this.blocknumber + 89);
      await this.farm.connect(this.bob).deposit(0, "0"); // block 90
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 94);

      await this.farm.connect(this.bob).deposit(0, "0"); // block 95
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 99);

      await this.farm.connect(this.bob).deposit(0, "0"); // block 100
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 100);

      await this.farm.connect(this.bob).deposit(0, "0"); // block 101
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("1000");

      await advanceBlockTo(this.blocknumber + 104);
      await this.farm.connect(this.bob).deposit(0, "0"); // block 105

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("5000");
    });

    it("user could able to prematurely Withdraw", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.farm = await this.FarmingContract.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 300).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.farm.deployed();
      await this.CNT.transfer(this.farm.address, "1000000000000000000000000");
      await this.farm.add("100", this.lp.address, 0, 0, true);
      await this.lp.connect(this.alice).approve(this.farm.address, "1000", {
        from: this.alice.address,
      });
      await this.lp.connect(this.bob).approve(this.farm.address, "1000", {
        from: this.bob.address,
      });
      await this.lp.connect(this.carol).approve(this.farm.address, "1000", {
        from: this.carol.address,
      });
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo(this.blocknumber + 309);
      await this.farm
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo(this.blocknumber + 313);
      await this.farm
        .connect(this.bob)
        .deposit(0, "20", { from: this.bob.address });
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo(this.blocknumber + 317);
      await this.farm
        .connect(this.carol)
        .deposit(0, "30", { from: this.carol.address });
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   FarmingContract should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo(this.blocknumber + 319);
      await this.farm
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });

      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("0");

      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo(this.blocknumber + 329);
      await this.farm
        .connect(this.bob)
        .withdraw(0, "5", { from: this.bob.address });

      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("6190");
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("0");

      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo(this.blocknumber + 339);
      await this.farm
        .connect(this.alice)
        .withdraw(0, "20", { from: this.alice.address });
      await advanceBlockTo(this.blocknumber + 349);
      await this.farm
        .connect(this.bob)
        .withdraw(0, "15", { from: this.bob.address });
      await advanceBlockTo(this.blocknumber + 359);
      await this.farm
        .connect(this.carol)
        .withdraw(0, "30", { from: this.carol.address });

      // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("11600");
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("11831");
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("26568");
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    });
  });
});
