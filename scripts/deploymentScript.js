const hre = require("hardhat");
const {WETH, FEETO_SETTER} = require("./addresses.json");

async function main() {
  // We get the contract to deploy
  const Factory = await hre.ethers.getContractFactory(
    "PolydexFactory"
  );
  const factory = await Factory.deploy(
    FEETO_SETTER
  );
  console.log("Deploying Factory Contract");
  await factory.deployTransaction.wait([(confirms = 5)]);

  console.log("PolydexFactory deployed to:", factory.address);

  let pairhash = await factory.pairCodeHash();
  console.log("PolydexFactory Pair Code Hash ", pairhash);

  await hre.run("verify:verify", {
    address: factory.address,
    constructorArguments: [
      FEETO_SETTER
    ],
  });

  const Router = await ethers.getContractFactory("PolydexRouter");
  const router = await Router.deploy(
    factory.address,
    WETH
  );
  console.log("Deploying Factory Contract");
  await router.deployTransaction.wait([(confirms = 5)]);

  console.log("PolydexRouter deployed at ", router.address);

  await hre.run("verify:verify", {
    address: router.address,
    constructorArguments: [
      factory.address, 
      WETH
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });