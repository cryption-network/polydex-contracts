// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const StakingPool = await hre.ethers.getContractFactory("StakingPool");
  const stakingPoolInstance = await StakingPool.deploy(
    ConstructorParams.FEE_ADDRESS
  );
  await stakingPoolInstance.deployed();
  console.log("Staking Pool deployed at " + stakingPoolInstance.address);
  await stakingPoolInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: stakingPoolInstance.address,
    constructorArguments: [
      ConstructorParams.FEE_ADDRESS
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
