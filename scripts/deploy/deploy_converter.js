// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const Converter = await hre.ethers.getContractFactory("Converter");
  const converterInstance = await Converter.deploy(
    ConstructorParams.POLYDEX_FACTORY,
    ConstructorParams.CNT_STAKER,
    ConstructorParams.CNT_TOKEN,
    ConstructorParams.L2Burner,
    ConstructorParams.WMATIC,
    ConstructorParams.BURN_ALLOCATION,
    ConstructorParams.STAKERS_ALLOCATION,
    ConstructorParams.PLATFORM_FEES_ALLOCATION,
    ConstructorParams.FEE_ADDRESS
  );
  await converterInstance.deployed();
  console.log("Converter deployed at " + converterInstance.address);
  await converterInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: converterInstance.address,
    constructorArguments: [
      ConstructorParams.POLYDEX_FACTORY,
      ConstructorParams.CNT_STAKER,
      ConstructorParams.CNT_TOKEN,
      ConstructorParams.L2Burner,
      ConstructorParams.WMATIC,
      ConstructorParams.BURN_ALLOCATION,
      ConstructorParams.STAKERS_ALLOCATION,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
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
