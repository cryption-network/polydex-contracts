// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const CNTStaker = await hre.ethers.getContractFactory("CNTStaker");
  const cntStakerInstance = await CNTStaker.deploy(
    ConstructorParams.CNT_TOKEN,
  );
  await cntStakerInstance.deployed();
  console.log("CNT Staker deployed at " + cntStakerInstance.address);
  await cntStakerInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: cntStakerInstance.address,
    constructorArguments: [
      ConstructorParams.CNT_TOKEN
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
