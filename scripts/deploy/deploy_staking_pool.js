// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const Addresses = require("../addresses.json");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const initToken1 = ethers.utils.parseUnits("1000000", "18");
  const initToken2 = ethers.utils.parseUnits("1000000", "18");
  const initToken3 = ethers.utils.parseUnits("1000000", "18");

  const blockReward1 = ethers.utils.parseUnits("0.1", "18");
  const blockreward2 = ethers.utils.parseUnits("0.2", "18");
  const blockreward2 = ethers.utils.parseUnits("0.3", "18");
  const withdrawlFee = "200";
  const harvestInterval = "300";

  const provider = new ethers.providers.JsonRpcProvider(
    "https://rpc-mumbai.maticvigil.com"
  );
  const [deployer] = await ethers.getSigners();

  let startBlock1 = await provider.getBlockNumber();

  const endblock = 10242765 + startBlock1;

  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPoolInstance = await StakingPool.deploy(Addresses.FEE_ADDRESS);
  await stakingPoolInstance.deployed();
  console.log("Staking Pool deployed at " + stakingPoolInstance.address);

  const transaction1 = await stakingPoolInstance.init(
    Addresses.CNT_TOKEN,
    initToken1,
    Addresses.CNT_TOKEN,
    blockReward,
    startBlock1,
    endblock,
    withdrawlFee,
    harvestInterval
  );
  await transaction.wait([(confirms = 5)]);

  let startBlock2 = await provider.getBlockNumber();
  let startBlock3 = await provider.getBlockNumber();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
