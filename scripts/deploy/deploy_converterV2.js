// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const ConverterV2 = await hre.ethers.getContractFactory("ConverterV2");
  const converterV2Instance = await ConverterV2.deploy(
    ConstructorParams.CNT_TOKEN,
    ConstructorParams.BURN_ALLOCATION,
    ConstructorParams.STAKERS_ALLOCATION,
    ConstructorParams.PLATFORM_FEES_ALLOCATION,
    ConstructorParams.FEE_ADDRESS
  );
  await converterV2Instance.deployed();
  console.log("ConverterV2 deployed at " + converterV2Instance.address);
  await converterV2Instance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: converterV2Instance.address,
    constructorArguments: [
      ConstructorParams.CNT_TOKEN,
      ConstructorParams.BURN_ALLOCATION,
      ConstructorParams.STAKERS_ALLOCATION,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
      ConstructorParams.FEE_ADDRESS
    ],
  });

  //change router address here if needed to be.
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
