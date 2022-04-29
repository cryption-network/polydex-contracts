// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const KOMWrapper = await ethers.getContractFactory("KOMWrapper");

  const komWrapperInstance = await KOMWrapper.deploy(
    ConstructorParams.KOM_TOKEN, //KOM Token
    ConstructorParams["5_TOKENS_STAKING_POOL"] //Staking Pool Address
  );

  await komWrapperInstance.deployed();
  await komWrapperInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: komWrapperInstance.address,
    constructorArguments: [
      ConstructorParams.KOM_TOKEN, //KOM Token
      ConstructorParams["5_TOKENS_STAKING_POOL"], //Staking Pool Address
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
