require("dotenv").config();
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { advanceBlockTo } = require("./utilities/time.js");

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

    // scenarios about deposit for and withdraw for
    // deposit for kra to jiske liye kra uske userinfo mein deposit ho jae
    // pending reward bhi mile user ko
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
    // agar kisi ne depositfor kra to wo withdrawfor na kr pae if not whitelisted
    // withdraw for kra to us user ke account mein pending cnt and userinfo amount aa jana chaiye
    // agar white listed hai to withdraw for kr pae
    // user whitelist se hata de to withdraw for na kr pae
  });
});
