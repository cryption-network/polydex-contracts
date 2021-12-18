const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../utilities/index");

describe("KOM Wrapper contract", function() {
  before(async function() {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const KOMToken = await ethers.getContractFactory("ERC20");
    this.komTokenInstance = KOMToken.attach(
      "0xc004e2318722ea2b15499d6375905d75ee5390b8"
    );

    console.log(
      "KOM token deployed at mainnet at",
      this.komTokenInstance.address,
      "Decimals",
      await this.komTokenInstance.decimals()
    );

    const KOMWrapper = await ethers.getContractFactory("KOMWrapper");

    this.komWrapperInstance = await KOMWrapper.deploy(
      this.komTokenInstance.address
    );

    await this.komWrapperInstance.deployed();

    console.log(
      "KOM Wrapper deployed at mainnet at",
      this.komWrapperInstance.address,
      "Decimals",
      await this.komWrapperInstance.decimals()
    );

    await this.komTokenInstance.approve(
      this.komWrapperInstance.address,
      MaxUint256
    );
  });

  it("should deposit KOM and receive WKOM correctly", async function() {
    console.log(
      "Before Deposit KOM Balance for Signer",
      Number(await this.komTokenInstance.balanceOf(this.signer.address))
    );

    console.log(
      "Before Deposit WKOM Balance for Signer",
      Number(await this.komWrapperInstance.balanceOf(this.signer.address))
    );

    console.log(
      "Before Deposit KOM Balance in WKOM Contract",
      Number(
        await this.komTokenInstance.balanceOf(this.komWrapperInstance.address)
      )
    );

    console.log("Testing Deposit");

    await this.komWrapperInstance.deposit(
      await this.komTokenInstance.balanceOf(this.signer.address)
    );

    console.log(
      "After Deposit KOM Balance for Signer",
      Number(await this.komTokenInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Deposit WKOM Balance for Signer",
      Number(await this.komWrapperInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Deposit KOM Balance in WKOM Contract",
      Number(
        await this.komTokenInstance.balanceOf(this.komWrapperInstance.address)
      )
    );
  });

  it("should withdraw WKOM for KOM correctly", async function() {
    console.log("Testing Withdraw");
    await this.komWrapperInstance.withdraw(
      this.signer.address,
      await this.komWrapperInstance.balanceOf(this.signer.address)
    );
    console.log(
      "After Withdraw KOM Balance for Signer",
      Number(await this.komTokenInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Withdraw WKOM Balance for Signer",
      Number(await this.komWrapperInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Withdraw KOM Balance in WKOM Contract",
      Number(
        await this.komTokenInstance.balanceOf(this.komWrapperInstance.address)
      )
    );
  });

  it("should transfer WKOM and receive KOM correctly", async function() {
    await this.komWrapperInstance.deposit(
      await this.komTokenInstance.balanceOf(this.signer.address)
    );
    console.log(
      "Before Transfer KOM Balance for Signer",
      Number(await this.komTokenInstance.balanceOf(this.signer.address))
    );

    console.log(
      "Before Transfer WKOM Balance for Signer",
      Number(await this.komWrapperInstance.balanceOf(this.signer.address))
    );

    console.log(
      "Before Transfer KOM Balance in WKOM Contract",
      Number(
        await this.komTokenInstance.balanceOf(this.komWrapperInstance.address)
      )
    );
    console.log("Testing Transfer");
    await this.komWrapperInstance.transfer(
      this.signer.address,
      await this.komWrapperInstance.balanceOf(this.signer.address)
    );
    console.log(
      "After Transfer KOM Balance for Signer",
      Number(await this.komTokenInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Transfer WKOM Balance for Signer",
      Number(await this.komWrapperInstance.balanceOf(this.signer.address))
    );

    console.log(
      "After Transfer KOM Balance in WKOM Contract",
      Number(
        await this.komTokenInstance.balanceOf(this.komWrapperInstance.address)
      )
    );
  });
});
