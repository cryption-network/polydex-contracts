const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { AddressZero } = ethers.constants;

const deployedAddresses = {
  cnt: "0xD1e6354fb05bF72A8909266203dAb80947dcEccF",
  wmatic: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  polydexFarm: "0x7c3a78c3C2B6B90F6A523ae76cb8C2CbBA691464",
  rewardManager: "0x3Da080bFc6088d38b79551E3A30328d6BF27ac7C",
  quickswapRouter: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  polydexRouter: "0xBd13225f0a45BEad8510267B4D6a7c78146Be459",
  quickswapLP: "0x3D3a6bCbC144915A21c289e9F0041813074F75C2",
  polydexLP: "0x71ccF81b24d500705d54cc8b6d420B1131a9E5E5",
  farmOwner: "0xA68E764D8917d253F997df1Fed1BdA8B38a281c8",
  rewardManagerOwner: "0x138d8d4b749c4113b2d88610302c20bab282677d",
  user: "0x10855704d1Dde09d90C0D1afEe4E1e6626e45Bb7",
  polydexFactory: "0x5BdD1CD910e3307582F213b33699e676E61deaD9",
  quickswapFactory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
  wrongLPAddress: "0x67ec655015d1a5F6b61A4560F769C8bb66a8a73F",
};

const balanceToSetInHex = "0x3635C9ADC5DEA00000";

describe.only("Quickswap Migrator", function() {
  before(async function() {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.cnt = ERC20Mock.attach(deployedAddresses.cnt);
    this.wmatic = ERC20Mock.attach(deployedAddresses.wmatic);

    const Farm = await ethers.getContractFactory("Farm");
    this.farm = Farm.attach(deployedAddresses.polydexFarm);

    const RewardManagerFactory = await ethers.getContractFactory(
      "RewardManagerFactory"
    );
    this.rewardManager = RewardManagerFactory.attach(
      deployedAddresses.rewardManager
    );

    const QuickSwapMigrator = await ethers.getContractFactory(
      "QuickSwapMigrator"
    );
    this.quickswapMigrator = await QuickSwapMigrator.deploy(
      deployedAddresses.polydexRouter,
      deployedAddresses.quickswapRouter,
      deployedAddresses.polydexFarm,
      deployedAddresses.polydexFarm,
      deployedAddresses.rewardManager,
      this.cnt.address
    );
    console.log("Migrator deployed at " + this.quickswapMigrator.address);

    let rewardManagerOwnerUser = deployedAddresses.rewardManagerOwner;
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [rewardManagerOwnerUser],
    });
    const rewardManagerOwner = await ethers.getSigner(rewardManagerOwnerUser);
    await hre.network.provider.send("hardhat_setBalance", [
      rewardManagerOwnerUser,
      balanceToSetInHex,
    ]);

    let farmOwnerUser = deployedAddresses.farmOwner;
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [farmOwnerUser],
    });
    const farmOwner = await ethers.getSigner(farmOwnerUser);
    await hre.network.provider.send("hardhat_setBalance", [
      farmOwnerUser,
      balanceToSetInHex,
    ]);

    await this.rewardManager
      .connect(rewardManagerOwner)
      .updateRewardDistributor(this.quickswapMigrator.address, true);
    await this.rewardManager
      .connect(rewardManagerOwner)
      .updateWhitelistAddress(6, this.quickswapMigrator.address, true);

    await this.farm
      .connect(farmOwner)
      .add(100, deployedAddresses.quickswapLP, 0, 86400, true);
  });

  it("should set correct state variables", async function() {
    const wmatic = await this.quickswapMigrator.wmatic();
    const polydexFarm = await this.quickswapMigrator.polydexFarm();
    const cnt = await this.quickswapMigrator.cnt();
    const rewardManager = await this.quickswapMigrator.rewardManager();
    const owner = await this.quickswapMigrator.owner();
    const polydexRouter = await this.quickswapMigrator.polydexRouter();
    const quickswapRouter = await this.quickswapMigrator.quickswapRouter();
    const polydexFactory = await this.quickswapMigrator.polydexFactory();
    const quickswapFactory = await this.quickswapMigrator.quickswapFactory();

    expect(wmatic).to.equal(this.wmatic.address);
    expect(polydexFarm).to.equal(this.farm.address);
    expect(cnt).to.equal(this.cnt.address);
    expect(rewardManager).to.equal(this.rewardManager.address);
    expect(owner).to.equal(this.signer.address);
    expect(polydexRouter).to.equal(deployedAddresses.polydexRouter);
    expect(quickswapRouter).to.equal(deployedAddresses.quickswapRouter);
    expect(polydexFactory).to.equal(deployedAddresses.polydexFactory);
    expect(quickswapFactory).to.equal(deployedAddresses.quickswapFactory);
  });

  it("should migrate liquidity of CNT-WMATIC farm", async function() {
    console.log("Initializing pre migration steps");
    let user = deployedAddresses.user;
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    await hre.network.provider.send("hardhat_setBalance", [
      user,
      balanceToSetInHex,
    ]);
    const oldPid = 0;
    const newPid = 17;
    const pendingCNT = await this.farm.pendingCNT(oldPid, user);
    console.log(
      `Pending CNT for harvest for the user is ${pendingCNT.toString()}`
    );
    let oldLPTokenAmountInFarm = (
      await this.farm.userInfo(oldPid, signer.address)
    ).amount;
    console.log(`LP tokens in old CNT-WMATIC farm - ${oldLPTokenAmountInFarm}`);
    let newLPTokenAmountInFarm = (
      await this.farm.userInfo(newPid, signer.address)
    ).amount;
    console.log(
      `LP tokens in new CNT-WMATIC farm - ${Number(newLPTokenAmountInFarm)}`
    );
    let userVestedCNT = (
      await this.rewardManager.userTotalVestingInfo(signer.address)
    ).totalVested;
    console.log(`Vested CNT - ${userVestedCNT.toString()}`);
    await this.farm
      .connect(signer)
      .addUserToWhiteList(this.quickswapMigrator.address);
    console.log("Migrator whitelisted by the user");
    console.log(
      "WMATIC Balance Before",
      (await this.wmatic.balanceOf(user)).toString()
    );
    console.log(
      "CNT Balance Before ",
      (await this.cnt.balanceOf(user)).toString()
    );

    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(oldPid, 0, AddressZero, newPid, deployedAddresses.quickswapLP)
    ).to.be.revertedWith("QuickSwapMigrator: No zero address");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(oldPid, 0, deployedAddresses.polydexLP, newPid, AddressZero)
    ).to.be.revertedWith("QuickSwapMigrator: No zero address");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          0,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith(
      "QuickSwapMigrator: LP Amount should be greater than zero"
    );
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          0,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith(
      "QuickSwapMigrator: LP Amount should be greater than zero"
    );
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          1,
          oldLPTokenAmountInFarm,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith("QuickSwapMigrator: Invalid pids");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          oldLPTokenAmountInFarm,
          deployedAddresses.wrongLPAddress,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith("QuickSwapMigrator: Invalid LP token addresses");

    await this.quickswapMigrator
      .connect(signer)
      .migrate(
        oldPid,
        oldLPTokenAmountInFarm,
        deployedAddresses.polydexLP,
        newPid,
        deployedAddresses.quickswapLP
      );

    oldLPTokenAmountInFarm = (await this.farm.userInfo(oldPid, signer.address))
      .amount;
    console.log(
      `LP tokens in CNT-WMATIC old farm after migration - ${Number(
        oldLPTokenAmountInFarm
      )}`
    );
    newLPTokenAmountInFarm = (await this.farm.userInfo(newPid, signer.address))
      .amount;
    console.log(
      `LP tokens in new CNT-WMATIC farm after migration - ${Number(
        newLPTokenAmountInFarm
      )}`
    );
    userVestedCNT = (
      await this.rewardManager.userTotalVestingInfo(signer.address)
    ).totalVested;
    console.log(`Vested CNT - ${userVestedCNT.toString()}`);

    console.log(
      "WMATIC Balance After ",
      (await this.wmatic.balanceOf(user)).toString()
    );
    console.log(
      "CNT Balance After  ",
      (await this.cnt.balanceOf(user)).toString()
    );
  });

  it("should migrate liquidity of CNT-WMATIC farm", async function() {
    console.log("Initializing pre migration steps");
    let user = "0x638ecf631cbec94ba8e5134a232fc80d5a0749ac";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    await hre.network.provider.send("hardhat_setBalance", [
      user,
      balanceToSetInHex,
    ]);
    const oldPid = 0;
    const newPid = 17;
    const pendingCNT = await this.farm.pendingCNT(oldPid, user);
    console.log(
      `Pending CNT for harvest for the user is ${pendingCNT.toString()}`
    );
    let oldLPTokenAmountInFarm = (
      await this.farm.userInfo(oldPid, signer.address)
    ).amount;
    console.log(`LP tokens in old CNT-WMATIC farm - ${oldLPTokenAmountInFarm}`);
    let newLPTokenAmountInFarm = (
      await this.farm.userInfo(newPid, signer.address)
    ).amount;
    console.log(
      `LP tokens in new CNT-WMATIC farm - ${Number(newLPTokenAmountInFarm)}`
    );
    let userVestedCNT = (
      await this.rewardManager.userTotalVestingInfo(signer.address)
    ).totalVested;
    console.log(`Vested CNT - ${userVestedCNT.toString()}`);
    await this.farm
      .connect(signer)
      .addUserToWhiteList(this.quickswapMigrator.address);
    console.log("Migrator whitelisted by the user");
    console.log(
      "WMATIC Balance Before",
      (await this.wmatic.balanceOf(user)).toString()
    );
    console.log(
      "CNT Balance Before ",
      (await this.cnt.balanceOf(user)).toString()
    );

    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(oldPid, 0, AddressZero, newPid, deployedAddresses.quickswapLP)
    ).to.be.revertedWith("QuickSwapMigrator: No zero address");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(oldPid, 0, deployedAddresses.polydexLP, newPid, AddressZero)
    ).to.be.revertedWith("QuickSwapMigrator: No zero address");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          0,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith(
      "QuickSwapMigrator: LP Amount should be greater than zero"
    );
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          0,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith(
      "QuickSwapMigrator: LP Amount should be greater than zero"
    );
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          1,
          oldLPTokenAmountInFarm,
          deployedAddresses.polydexLP,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith("QuickSwapMigrator: Invalid pids");
    await expect(
      this.quickswapMigrator
        .connect(signer)
        .migrate(
          oldPid,
          oldLPTokenAmountInFarm,
          deployedAddresses.wrongLPAddress,
          newPid,
          deployedAddresses.quickswapLP
        )
    ).to.be.revertedWith("QuickSwapMigrator: Invalid LP token addresses");

    await this.quickswapMigrator
      .connect(signer)
      .migrate(
        oldPid,
        oldLPTokenAmountInFarm,
        deployedAddresses.polydexLP,
        newPid,
        deployedAddresses.quickswapLP
      );

    oldLPTokenAmountInFarm = (await this.farm.userInfo(oldPid, signer.address))
      .amount;
    console.log(
      `LP tokens in CNT-WMATIC old farm after migration - ${Number(
        oldLPTokenAmountInFarm
      )}`
    );
    newLPTokenAmountInFarm = (await this.farm.userInfo(newPid, signer.address))
      .amount;
    console.log(
      `LP tokens in new CNT-WMATIC farm after migration - ${Number(
        newLPTokenAmountInFarm
      )}`
    );
    userVestedCNT = (
      await this.rewardManager.userTotalVestingInfo(signer.address)
    ).totalVested;
    console.log(`Vested CNT - ${userVestedCNT.toString()}`);

    console.log(
      "WMATIC Balance After ",
      (await this.wmatic.balanceOf(user)).toString()
    );
    console.log(
      "CNT Balance After  ",
      (await this.cnt.balanceOf(user)).toString()
    );
  });
});
