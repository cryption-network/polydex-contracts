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
  const provider = new ethers.providers.JsonRpcProvider();
  const [deployer] = await ethers.getSigners();

  const Converter = await ethers.getContractFactory("Converter");
  const converterInstance = await Converter.deploy(
    Addresses.POLYDEX_FACTORY,
    Addresses.CNT_STAKER,
    Addresses.CNT_TOKEN,
    Addresses.WMATIC,
    Addresses.BURN_ALLOCATION,
    Addresses.STAKERS_ALLOCATION,
    Addresses.PLATFORM_FEES_ALLOCATION,
    Addresses.FEE_ADDRESS
  );
  await converterInstance.deployed();
  console.log("Converter deployed at " + converterInstance.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
