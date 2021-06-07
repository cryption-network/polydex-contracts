// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const { weth } = require("./addresses.json");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  const provider = new ethers.providers.JsonRpcProvider();
  const [deployer] = await ethers.getSigners();

  // We get the contract to deploy
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.deployed();
  console.log("PolyDexFactory deployed at " + factory.address);
  let pairhash = await factory.pairCodeHash();
  console.log("PolyDexFactory Pair Code Hash " + pairhash);

  const Router = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(factory.address, weth);
  router.deployed();
  console.log("PolyDexRouter deployed at " + router.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
