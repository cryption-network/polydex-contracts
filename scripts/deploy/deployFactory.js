const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // We get the contract to deploy
  const Factory = await hre.ethers.getContractFactory(
    "PolydexFactory"
  );
  const factory = await Factory.deploy(
    ConstructorParams.FEETO_SETTER
  );

  console.log("PolydexFactory deployed to:", factory.address);

  let pairhash = await factory.pairCodeHash();
   // Note: While deploying Router make sure to change pair hash in PolydexLibrary before deploying.
  console.log("PolydexFactory Pair Init Code Hash:", pairhash);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });