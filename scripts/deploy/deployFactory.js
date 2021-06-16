const hre = require("hardhat");
const { FEETO_SETTER } = require("../addresses.json");

async function main() {
  // We get the contract to deploy
  const Factory = await hre.ethers.getContractFactory(
    "PolydexFactory"
  );
  const factory = await Factory.deploy(
    FEETO_SETTER
  );

  console.log("PolydexFactory deployed to:", factory.address);

  let pairhash = await factory.pairCodeHash();
  console.log("PolydexFactory Pair Init Code Hash:", pairhash);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });