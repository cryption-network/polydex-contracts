const hre = require("hardhat");
const {WMATIC, POLYDEX_FACTORY} = require("./addresses.json");

async function main() {
  // We get the contract to deploy
  const Router = await hre.ethers.getContractFactory("PolydexRouter");
  const router = await Router.deploy(
    POLYDEX_FACTORY,
    WMATIC
  );
  console.log("PolydexRouter deployed at:", router.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });