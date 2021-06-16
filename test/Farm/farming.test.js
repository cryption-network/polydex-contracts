require("dotenv").config();
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceBlockTo } = require("../utilities/time.js");

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

    this.MasterChef = await ethers.getContractFactory("Farm");
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

  it("should set correct state variables", async function () {
    this.chef = await this.MasterChef.deploy(
      this.CNT.address,
      "1000",
      this.adminaddress,
      "0",
      "1000"
    );
    await this.chef.deployed();

    await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

    const CNT = await this.chef.cnt();
    const owner = await this.CNT.owner();

    expect(CNT).to.equal(this.CNT.address);
    expect(owner).to.equal(this.adminaddress);
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
    });

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "100",
        this.adminaddress,
        "100",
        "1000"
      );
      await this.chef.deployed();

      await this.chef.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.chef.address, "1000");

      await this.chef.connect(this.bob).deposit(0, "100");

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900");

      await this.chef.connect(this.bob).emergencyWithdraw(0);

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
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

    it("should give out CNTs only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 100).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.chef.deployed();

      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");

      await this.chef.add("100", this.lp.address, 0, 0, true);

      await this.lp.connect(this.bob).approve(this.chef.address, "1000");
      await this.chef.connect(this.bob).deposit(0, "100");
      await advanceBlockTo(this.blocknumber + 89);
      await this.chef.connect(this.bob).deposit(0, "0"); // block 90
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 94);

      await this.chef.connect(this.bob).deposit(0, "0"); // block 95
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 99);

      await this.chef.connect(this.bob).deposit(0, "0"); // block 100
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      await advanceBlockTo(this.blocknumber + 100);

      await this.chef.connect(this.bob).deposit(0, "0"); // block 101
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("1000");

      await advanceBlockTo(this.blocknumber + 104);
      await this.chef.connect(this.bob).deposit(0, "0"); // block 105

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("5000");
    });

    it("should not distribute CNTs if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 200).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.chef.deployed();
      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");
      await this.chef.add("100", this.lp.address, 0, 0, true);
      await this.lp.connect(this.bob).approve(this.chef.address, "1000");
      await advanceBlockTo(this.blocknumber + 199);

      await advanceBlockTo(this.blocknumber + 204);

      await advanceBlockTo(this.blocknumber + 209);
      await this.chef.connect(this.bob).deposit(0, "10"); // block 210

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
      await advanceBlockTo(this.blocknumber + 219);
      await this.chef.connect(this.bob).withdraw(0, "10"); // block 220

      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("10000");
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    });

    it("should distribute CNTs properly for each staker", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 300).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.chef.deployed();
      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");
      await this.chef.add("100", this.lp.address, 0, 0, true);
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
        from: this.alice.address,
      });
      await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
        from: this.bob.address,
      });
      await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
        from: this.carol.address,
      });
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo(this.blocknumber + 309);
      await this.chef
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo(this.blocknumber + 313);
      await this.chef
        .connect(this.bob)
        .deposit(0, "20", { from: this.bob.address });
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo(this.blocknumber + 317);
      await this.chef
        .connect(this.carol)
        .deposit(0, "30", { from: this.carol.address });
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo(this.blocknumber + 319);
      await this.chef
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });

      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("0");

      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo(this.blocknumber + 329);
      await this.chef
        .connect(this.bob)
        .withdraw(0, "5", { from: this.bob.address });

      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.CNT.balanceOf(this.bob.address)).to.equal("6190");
      expect(await this.CNT.balanceOf(this.carol.address)).to.equal("0");

      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo(this.blocknumber + 339);
      await this.chef
        .connect(this.alice)
        .withdraw(0, "20", { from: this.alice.address });
      await advanceBlockTo(this.blocknumber + 349);
      await this.chef
        .connect(this.bob)
        .withdraw(0, "15", { from: this.bob.address });
      await advanceBlockTo(this.blocknumber + 359);
      await this.chef
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

    it("should give proper CNTs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus u  ntil block 1000
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "1000",
        this.adminaddress,
        (this.blocknumber + 400).toString(),
        (this.blocknumber + 1000).toString()
      );
      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");
      await this.lp
        .connect(this.alice)
        .approve(this.chef.address, "1000", { from: this.alice.address });
      await this.lp2
        .connect(this.bob)
        .approve(this.chef.address, "1000", { from: this.bob.address });
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, 0, 0, true);
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo(this.blocknumber + 409);
      await this.chef
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo(this.blocknumber + 419);
      await this.chef.add("20", this.lp2.address, 0, 0, true);
      // Alice should have 10*1000 pending reward
      expect(await this.chef.pendingCNT(0, this.alice.address)).to.equal(
        "10000"
      );
      // Bob deposits 5 LP2s at block 425
      await advanceBlockTo(this.blocknumber + 424);
      await this.chef
        .connect(this.bob)
        .deposit(1, "5", { from: this.bob.address });
      // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
      expect(await this.chef.pendingCNT(0, this.alice.address)).to.equal(
        "11666"
      );
      await advanceBlockTo(this.blocknumber + 430);
      // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
      expect(await this.chef.pendingCNT(0, this.alice.address)).to.equal(
        "13333"
      );
      expect(await this.chef.pendingCNT(1, this.bob.address)).to.equal("3333");
    });

    it("should stop giving bonus CNTs after the bonus period ends", async function () {
      // 100 per block farming rate starting at block 500 with bonus until block 600
      this.chef = await this.MasterChef.deploy(
        this.CNT.address,
        "100",
        this.adminaddress,
        (this.blocknumber + 500).toString(),
        (this.blocknumber + 600).toString()
      );
      await this.CNT.transfer(this.chef.address, "1000000000000000000000000");
      await this.lp
        .connect(this.alice)
        .approve(this.chef.address, "1000", { from: this.alice.address });
      await this.chef.add("1", this.lp.address, 0, 0, true);
      // Alice deposits 10 LPs at block 590
      await advanceBlockTo(this.blocknumber + 589);
      await this.chef
        .connect(this.alice)
        .deposit(0, "10", { from: this.alice.address });
      // At block 605, she should have 1000*1 + 100*5 = 1500 pending.
      await advanceBlockTo(this.blocknumber + 605);
      expect(await this.chef.pendingCNT(0, this.alice.address)).to.equal(
        "1500"
      );
      // At block 606, Alice withdraws all pending rewards and should get 10600.
      await this.chef
        .connect(this.alice)
        .deposit(0, "0", { from: this.alice.address });
      expect(await this.chef.pendingCNT(0, this.alice.address)).to.equal("0");
      expect(await this.CNT.balanceOf(this.alice.address)).to.equal("1600");
    });
  });
});
