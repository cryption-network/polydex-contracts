require("dotenv").config();
const { expectRevert } = require("@openzeppelin/test-helpers");
const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { ethers } = require("hardhat");
const { advanceBlockTo, advanceTime } = require("./utilities/time.js");
chai.use(solidity);
const { expect } = chai;

describe("MasterChef", function () {
  before(async function () {
    const [deployer] = await ethers.getSigners();
    this.adminaddress = deployer.address;
    this.signers = await ethers.getSigners();

    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
    this.dev = this.signers[4];
    this.minter = this.signers[5];

    this.MasterChef = await ethers.getContractFactory("MasterChef");
    this.CryptionNetworkToken = await ethers.getContractFactory(
      "CryptionNetworkToken"
    );
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
  });

  beforeEach(async function () {
    this.CNT = await this.CryptionNetworkToken.deploy(this.adminaddress);
    await this.CNT.deployed();
    this.provider = new ethers.providers.JsonRpcProvider();
    this.blocknumber = await this.provider.getBlockNumber();
  });

  context("checking DepsoitFor and withdrawFor functionlity", function () {
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
    });

    it("is CNT transfering to masterchef", async function () {
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "100",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");
      expect(await this.CNT.balanceOf(this.chef.address)).to.equal(
        "1000000000000000000000000"
      );
    });

    it("checking deposit for functionlity", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 100).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

      await this.chef.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.chef.address, "1000");
      await this.chef.connect(this.bob).deposit(0, "100");

      await advanceBlockTo(this.blocknumber + 100);

      await this.chef.connect(this.bob).deposit(0, "0"); // block 101
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("1000");

      // 2 blocks
      await this.lp.connect(this.carol).approve(this.chef.address, "1000");
      await this.chef
        .connect(this.carol)
        .depositFor(0, "100", this.bob.address);

      // 1000 + 2000 for two blocks

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("3000");

      this.bobuserinfo = await this.chef.userInfo("0", this.bob.address);
      this.bobDepositedAmount = await this.bobuserinfo["amount"].toString();

      expect(this.bobDepositedAmount).to.equal("200");

      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("0");

      this.caroluserinfo = await this.chef.userInfo("0", this.carol.address);
      this.carolDepositedAmount = await this.caroluserinfo["amount"].toString();

      expect(this.carolDepositedAmount).to.equal("0");
    });

    it("whitelisted user should only be able to run withdrawFor", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 100).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

      await this.chef.add("100", this.lp.address, 0, 0, true);

      // deposit for
      await this.lp.connect(this.carol).approve(this.chef.address, "1000");
      await this.chef
        .connect(this.carol)
        .depositFor(0, "100", this.bob.address);

      await advanceBlockTo(this.blocknumber + 100);

      await expect(
        this.chef.connect(this.carol).withdrawFor("0", "100", this.bob.address)
      ).to.be.revertedWith("user not whitelisted");

      await this.chef.connect(this.bob).addUserToWhiteList(this.carol.address);

      this.pendingcntofBob = await this.chef.pendingCNT("0", this.bob.address);
      // 1block
      await this.chef
        .connect(this.carol)
        .withdrawFor("0", "100", this.bob.address);

      this.bobuserinfo = await this.chef.userInfo("0", this.bob.address);
      this.bobDepositedAmount = await this.bobuserinfo["amount"].toString();

      this.pendingcntAfterWithdrawFor = await this.chef.pendingCNT(
        "0",
        this.bob.address
      );
      // bob ka balance 0
      expect(this.bobDepositedAmount).to.be.equal("0");
      // pending 0
      expect(this.pendingcntAfterWithdrawFor).to.be.equal("0");

      // carol ka balance of lp == 100 + 900
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
      // cnt pending == 3000
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("2000");

      await this.chef
        .connect(this.bob)
        .removeUserFromWhiteList(this.carol.address);

      await this.lp.connect(this.bob).approve(this.chef.address, "100");
      await this.chef.connect(this.bob).deposit(0, "100");

      // error
      await expect(
        this.chef.connect(this.carol).withdrawFor("0", "100", this.bob.address)
      ).to.be.revertedWith("user not whitelisted");
    });
  });

  context("Harvest Time Lock", function () {
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
    });

    it("reward got unlocked only after harvestInterval", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 100).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

      // reward lock period is 5 minutes
      await this.chef.add("100", this.lp.address, 0, 300, true);

      await this.lp.connect(this.bob).approve(this.chef.address, "1000");
      await this.chef.connect(this.bob).deposit(0, "100");

      await advanceBlockTo(this.blocknumber + 100);

      await this.chef.connect(this.bob).deposit(0, "0"); // block 101
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.chef.totalLockedUpRewards()).to.equal("1000");

      await this.chef.connect(this.bob).deposit(0, "100"); // block 102
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.chef.totalLockedUpRewards()).to.equal("2000");

      await advanceTime(300);

      // reward got unlocked only after time set ie 300 seconds
      await this.chef.connect(this.bob).deposit(0, "0"); // block 103
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("3000");
      expect(await this.chef.totalLockedUpRewards()).to.equal("0");
    });

    it("pending reward give after harvest interval if use withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 100).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

      // reward lock period is 5 minutes
      await this.chef.add("100", this.lp.address, 0, 300, true);

      await this.lp.connect(this.bob).approve(this.chef.address, "1000");
      await this.chef.connect(this.bob).deposit(0, "100");

      await advanceBlockTo(this.blocknumber + 102);

      // withdraw 10
      await this.chef.connect(this.bob).withdraw(0, "10"); // block 103
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.chef.totalLockedUpRewards()).to.equal("3000");

      // 1000 - 100 + 10
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("910");

      await advanceTime(300);

      await this.chef.connect(this.bob).withdraw(0, "90"); // block 104
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal(3999);
      expect(await this.chef.totalLockedUpRewards()).to.equal("0");

      // 1000 - 100 + 10 + 90

      await this.chef.connect(this.bob).deposit(0, "100"); // 105 - 4 block rewards

      await this.chef.connect(this.bob).deposit(0, "0");
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("3999");
      expect(await this.chef.totalLockedUpRewards()).to.equal("1000");
    });
  });
});
