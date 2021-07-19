// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  const provider = new ethers.providers.JsonRpcProvider();
  const [deployer] = await ethers.getSigners();

  const Farm = await ethers.getContractFactory("Farm");
  const farmInstance = await Farm.deploy(
    ConstructorParams.CNT_TOKEN,
    ConstructorParams.CNT_PER_BLOCK,
    ConstructorParams.FEE_ADDRESS,
    ConstructorParams.START_BLOCK,
    ConstructorParams.BONUS_END_BLOCK
  );
  await farmInstance.deployed();
  console.log("Farm deployed at " + farmInstance.address);
  await farmInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: farmInstance.address,
    constructorArguments: [
      ConstructorParams.CNT_TOKEN,
      ConstructorParams.CNT_PER_BLOCK,
      ConstructorParams.FEE_ADDRESS,
      ConstructorParams.START_BLOCK,
      ConstructorParams.BONUS_END_BLOCK
    ],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
