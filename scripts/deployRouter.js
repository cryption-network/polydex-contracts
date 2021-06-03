const hre = require("hardhat");
const {WETH, POLYDEX_FACTORY} = require("./addresses.json");

async function main() {
  // We get the contract to deploy
  const Router = await hre.ethers.getContractFactory("PolydexRouter");
  const router = await Router.deploy(
    POLYDEX_FACTORY,
    WETH
  );
  console.log("PolydexRouter deployed at:", router.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });