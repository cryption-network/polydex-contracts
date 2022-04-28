const hre = require("hardhat");
const deployedContracts = require("./addresses.json");

const deployedAddresses = {
  polydexRouter: "0xBd13225f0a45BEad8510267B4D6a7c78146Be459",
  quickswapRouter: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  polydexFarm: "0x7c3a78c3C2B6B90F6A523ae76cb8C2CbBA691464",
  quickswapFarm: "0x7c3a78c3C2B6B90F6A523ae76cb8C2CbBA691464",
  rewardManager: "0x3Da080bFc6088d38b79551E3A30328d6BF27ac7C",
  cnt: "0xD1e6354fb05bF72A8909266203dAb80947dcEccF",
};

async function main() {
  // We get the contract to deploy
  const QuickSwapMigrator = await ethers.getContractFactory(
    "QuickSwapMigrator"
  );

  const quickswapMigrator = await QuickSwapMigrator.deploy(
    deployedAddresses.polydexRouter,
    deployedAddresses.quickswapRouter,
    deployedAddresses.polydexFarm,
    deployedAddresses.quickswapFarm,
    deployedAddresses.rewardManager,
    deployedAddresses.cnt
  );
  console.log("QuickSwapMigrator deployed at " + quickswapMigrator.address);

  await quickswapMigrator.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: quickswapMigrator.address,
    constructorArguments: [
      deployedAddresses.polydexRouter,
      deployedAddresses.quickswapRouter,
      deployedAddresses.polydexFarm,
      deployedAddresses.quickswapFarm,
      deployedAddresses.rewardManager,
      deployedAddresses.cnt,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
