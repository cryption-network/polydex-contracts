// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // Note : Make sure to change init pair hash in `pairForOldRouter` in 
  //        PolydexMigrator contract before deploying.
  // We get the contract to deploy
  const PolydexMigrator = await hre.ethers.getContractFactory("PolyDexMigrator");
  const polydexMigratorInstance = await PolydexMigrator.deploy(
    ConstructorParams.oldrouter,
    ConstructorParams.newrouter
  );
  await polydexMigratorInstance.deployed();
  console.log("PolydexMigrator deployed at " + polydexMigratorInstance.address);

  await polydexMigratorInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: polydexMigratorInstance.address,
    constructorArguments: [
      ConstructorParams.oldrouter,
      ConstructorParams.newrouter
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
