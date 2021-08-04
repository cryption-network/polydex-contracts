const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const ConstructorParams = require("../../scripts/constructorParams.json");
const { BigNumber } = require("@ethersproject/bignumber");

const ERC20TokensSupply = 10000000000;

describe("Converter contract", function () {

  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.adminAddress = this.signer.address;
    this.signer1 = this.signers[1];
    this.platformAddr = this.signer1.address;
    const CryptionNetworkToken = await ethers.getContractFactory(
      "MockCryptionNetworkToken"
    );
    const WMATICToken = await ethers.getContractFactory(
      "ERC20Mock"
    );
    const PolydexFactory = await ethers.getContractFactory(
        "PolydexFactory"
    );
    const PolydexRouter = await ethers.getContractFactory("PolydexRouter");
    const Converter = await ethers.getContractFactory("Converter");
    this.PolydexERC20 = await ethers.getContractFactory(
      "PolydexERC20"
    );

    this.cntTokenInstance = await CryptionNetworkToken.deploy(this.adminAddress);
    await this.cntTokenInstance.deployed();
    this.wmaticTokenInstance = await WMATICToken.deploy("Wrapped Matic", "WMATIC", ERC20TokensSupply);
    await this.wmaticTokenInstance.deployed();
    this.polydexFactoryInstance = await PolydexFactory.deploy(
      this.adminAddress
      );
    await this.polydexFactoryInstance.deployed();
    console.log("cntTokenInstance deployed at " + this.cntTokenInstance.address);
    console.log("wmaticTokenInstance deployed at " + this.wmaticTokenInstance.address);
    console.log("polydexFactoryInstance deployed at " + this.polydexFactoryInstance.address);
    this.polydexRouterInstance = await PolydexRouter.deploy(
      this.polydexFactoryInstance.address,
      this.wmaticTokenInstance.address
      );
    await this.polydexRouterInstance.deployed();
    this.converterInstance = await Converter.deploy(
      this.polydexFactoryInstance.address,
      ConstructorParams.CNT_STAKER,
      this.cntTokenInstance.address,
      ConstructorParams.L2Burner,
      this.wmaticTokenInstance.address,
      ConstructorParams.BURN_ALLOCATION,
      ConstructorParams.STAKERS_ALLOCATION,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
      this.platformAddr);
    await this.converterInstance.deployed();
    console.log("polydexRouterInstance deployed at " + this.polydexRouterInstance.address);
    console.log("converterInstance deployed at " + this.converterInstance.address);

    await this.polydexFactoryInstance.connect(this.signer).setFeeTo(this.converterInstance.address);

    const token1 = await ethers.getContractFactory(
      "ERC20Mock"
    );
    const token2 = await ethers.getContractFactory(
      "ERC20Mock"
    );
    this.token1Instance = await token1.deploy("Token A", "ABC", ERC20TokensSupply);
    this.token2Instance = await token2.deploy("Token B", "XYZ", ERC20TokensSupply);
    await this.token1Instance.deployed();
    await this.token2Instance.deployed();

    await this.token1Instance.connect(this.signer).approve(this.polydexRouterInstance.address, BigNumber.from(String(ERC20TokensSupply)));
    await this.token2Instance.connect(this.signer).approve(this.polydexRouterInstance.address, BigNumber.from(String(ERC20TokensSupply)));
    await this.cntTokenInstance.connect(this.signer).approve(this.polydexRouterInstance.address, BigNumber.from(String(ERC20TokensSupply)));
    await this.wmaticTokenInstance.connect(this.signer).approve(this.polydexRouterInstance.address, BigNumber.from(String(ERC20TokensSupply)));

    await this.polydexRouterInstance.connect(this.signer).addLiquidity(
      this.token1Instance.address,
      this.token2Instance.address,
      BigNumber.from("10000"),
      BigNumber.from("10000"),
      0,
      0,
      this.signer.address,
      MaxUint256,
    );

    await this.polydexRouterInstance.connect(this.signer).addLiquidity(
      this.cntTokenInstance.address,
      this.token2Instance.address,
      BigNumber.from("1000"),
      BigNumber.from("10000"),
      0,
      0,
      this.signer.address,
      MaxUint256,
    );

    await this.polydexRouterInstance.connect(this.signer).addLiquidity(
      this.cntTokenInstance.address,
      this.token1Instance.address,
      BigNumber.from("1000"),
      BigNumber.from("10000"),
      0,
      0,
      this.signer.address,
      MaxUint256,
    );

    await this.polydexRouterInstance.connect(this.signer).addLiquidity(
      this.wmaticTokenInstance.address,
      this.cntTokenInstance.address,
      BigNumber.from("1000"),
      BigNumber.from("10000"),
      0,
      0,
      this.signer.address,
      MaxUint256,
    );

    await this.polydexRouterInstance.connect(this.signer).swapExactTokensForTokens(
      BigNumber.from("500"),
      0,
      [this.token1Instance.address,this.token2Instance.address],
      this.signer.address,
      MaxUint256,
    );
  });

  it("should set correct state variables", async function () {
  
    const factory = await this.converterInstance.factory();
    const router = await this.converterInstance.router();
    const cnt = await this.converterInstance.cnt();
    const cntStaker = await this.converterInstance.cntStaker();
    const wmatic = await this.converterInstance.wmatic();
    const l2Burner = await this.converterInstance.l2Burner();
    const burnAllocation = await this.converterInstance.burnAllocation();
    const stakersAllocation = await this.converterInstance.stakersAllocation();
    const platformFeesAllocation = await this.converterInstance.platformFeesAllocation();
    const platformAddr = await this.converterInstance.platformAddr();
    const owner = await this.converterInstance.owner();

    expect(factory).to.equal(this.polydexFactoryInstance.address);
    expect(cnt).to.equal(this.cntTokenInstance.address);
    expect(cntStaker).to.equal(ConstructorParams.CNT_STAKER);
    expect(wmatic).to.equal(this.wmaticTokenInstance.address);
    expect(l2Burner).to.equal(ConstructorParams.L2Burner);
    expect(burnAllocation).to.equal(Number(ConstructorParams.BURN_ALLOCATION));
    expect(stakersAllocation).to.equal(Number(ConstructorParams.STAKERS_ALLOCATION));
    expect(platformFeesAllocation).to.equal(Number(ConstructorParams.PLATFORM_FEES_ALLOCATION));
    expect(platformAddr).to.equal(this.platformAddr);
    expect(owner).to.equal(this.adminAddress);
  });

  it("should set correctly set the polydex router", async function () {
    await this.converterInstance.connect(this.signer).updateRouter(this.polydexRouterInstance.address);
    const router = await this.converterInstance.router();
    expect(router).to.equal(this.polydexRouterInstance.address);
  });

  it("should revert if pair is not found for LP tokens", async function () { 
    await expect(this.converterInstance.connect(this.signer).convertLP(AddressZero, [this.token1Instance.address,this.cntTokenInstance.address], this.token2Instance.address, [this.token2Instance.address, this.cntTokenInstance.address]))
   .to.be.revertedWith('Invalid pair');
   });

  it("should correctly call convertLP function and correctly allocate CNT tokens", async function () { 
    const pairAddress = this.polydexFactoryInstance.getPair(this.token1Instance.address, this.token2Instance.address);
    const polydexERC20Instance = this.PolydexERC20.attach(pairAddress);
    await polydexERC20Instance.connect(this.signer).transfer(this.converterInstance.address, BigNumber.from("100"));
    const cntStaker = await this.converterInstance.cntStaker();
    const l2Burner = await this.converterInstance.l2Burner();
    const platformAddr = await this.converterInstance.platformAddr();
    const tx = await this.converterInstance.connect(this.signer).convertLP(this.token1Instance.address, [this.token1Instance.address,this.cntTokenInstance.address], this.token2Instance.address, [this.token2Instance.address, this.cntTokenInstance.address]);
    const txReceipt = await tx.wait();
    const cntConvertedEventLogs = txReceipt.events?.filter((x) => {return x.event == "CNTConverted"});
    expect(cntConvertedEventLogs.length).to.be.greaterThan(0)
    const { args } = cntConvertedEventLogs[0];
    expect(args).to.be.haveOwnProperty('stakersAllocated');
    expect(args).to.be.haveOwnProperty('burnt');
    expect(args).to.be.haveOwnProperty('platformFees');
    const {stakersAllocated, burnt, platformFees} = args;
    expect(Number(stakersAllocated)).to.be.greaterThan(0);
    expect(Number(burnt)).to.be.greaterThan(0);
    expect(Number(platformFees)).to.be.greaterThan(0);
    expect(Number(await this.cntTokenInstance.balanceOf(cntStaker))).to.be.equal(Number(stakersAllocated));
    expect(Number(await this.cntTokenInstance.balanceOf(l2Burner))).to.be.equal(Number(burnt));
    expect(Number(await this.cntTokenInstance.balanceOf(platformAddr))).to.be.equal(Number(platformFees));
   });

   it("should correctly call convertLP function and emit CNTConverted event", async function () { 
    const pairAddress = this.polydexFactoryInstance.getPair(this.token1Instance.address, this.token2Instance.address);
    const polydexERC20Instance = this.PolydexERC20.attach(pairAddress);
    await polydexERC20Instance.connect(this.signer).transfer(this.converterInstance.address, BigNumber.from("100"));
    await expect(this.converterInstance.connect(this.signer).convertLP(this.token1Instance.address, [this.token1Instance.address,this.cntTokenInstance.address], this.token2Instance.address, [this.token2Instance.address, this.cntTokenInstance.address]))
   .to.emit(this.converterInstance, 'CNTConverted');
   });

  it("should correctly call convertToken function and correctly allocate CNT tokens", async function () { 
    await this.wmaticTokenInstance.connect(this.signer).transfer(this.converterInstance.address, BigNumber.from("100"));
    const tx = await this.converterInstance.connect(this.signer).convertToken(this.wmaticTokenInstance.address, [this.wmaticTokenInstance.address,this.cntTokenInstance.address]);
    const txReceipt = await tx.wait();
    const cntConvertedEventLogs = txReceipt.events?.filter((x) => {return x.event == "CNTConverted"});
    expect(cntConvertedEventLogs.length).to.be.greaterThan(0)
    const { args } = cntConvertedEventLogs[0];
    expect(args).to.be.haveOwnProperty('stakersAllocated');
    expect(args).to.be.haveOwnProperty('burnt');
    expect(args).to.be.haveOwnProperty('platformFees');
    const {stakersAllocated, burnt, platformFees} = args;
    expect(Number(stakersAllocated)).to.be.greaterThan(0);
    expect(Number(burnt)).to.be.greaterThan(0);
    expect(Number(platformFees)).to.be.greaterThan(0);
   });

  });