const Factory = artifacts.require("UniswapV2Factory.sol");
const Router = artifacts.require("UniswapV2Router02.sol");
const WMATIC = artifacts.require("WMATIC.sol");
const CryptionNetworkToken = artifacts.require("CryptionNetworkToken.sol");
const MasterChef = artifacts.require("MasterChef.sol");
const CoffeeTable = artifacts.require("CoffeeTable.sol");
const CoffeeGrinder = artifacts.require("CoffeeGrinder.sol");


module.exports = async function (deployer, _network, addresses) {
  const [admin, _] = addresses;

  await deployer.deploy(WMATIC);
  const wmatic = await WMATIC.deployed();

  await deployer.deploy(Factory, admin);
  const factory = await Factory.deployed();

  await deployer.deploy(Router, factory.address, wmatic.address);
  await Router.deployed();

  await deployer.deploy(CryptionNetworkToken);
  const cryptionToken = await CryptionNetworkToken.deployed();

  await deployer.deploy(MasterChef, cryptionToken.address,'1000000000000000000', 11845318, 11845318);
  await MasterChef.deployed();

  await deployer.deploy(CoffeeTable, cryptionToken.address);
  const coffeetable = await CoffeeTable.deployed();

  await deployer.deploy(
    CoffeeGrinder,
    factory.address,
    coffeetable.address,
    cryptionToken.address,
    wmatic.address,
    100,
    800,
    100,
    admin
  );
  const coffeegrinder = await CoffeeGrinder.deployed();

  await factory.setFeeTo(coffeegrinder.address);
};
