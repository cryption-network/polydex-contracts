// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // Note : Make sure to change init pair hash in `pairForOldRouter` in 
  //        PolydexMigratorDFYN contract before deploying.
  // We get the contract to deploy
  const PolydexMigratorDFYN = await hre.ethers.getContractFactory("PolydexMigratorDFYN");
  const PolydexMigratorDFYNInstance = await PolydexMigratorDFYN.deploy(
    ConstructorParams.dfyn_router,
    ConstructorParams.newrouter,
    ConstructorParams.WMATIC,
    ConstructorParams.dfyn_Wmatic
  );
  await polydexMigratorDFYNInstance.deployed();
  console.log("PolydexMigratorDFYN deployed at " + polydexMigratorDFYNInstance.address);

  await PolydexMigratorDFYNInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: polydexMigratorDFYNInstance.address,
    constructorArguments: [
      ConstructorParams.oldrouter,
      ConstructorParams.newrouter,
      ConstructorParams.WMATIC,
      ConstructorParams.dfyn_Wmatic
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
