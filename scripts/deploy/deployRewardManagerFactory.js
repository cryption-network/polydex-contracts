const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // We get the contract to deploy
  const RewardManagerFactory = await hre.ethers.getContractFactory(
    "RewardManagerFactory"
  );
  const rewardManagerFactory = await RewardManagerFactory.deploy(
    ConstructorParams.CNT_TOKEN
  );

  console.log(
    "RewardManagerFactory deployed at:",
    rewardManagerFactory.address
  );

  await rewardManagerFactory.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: rewardManagerFactory.address,
    constructorArguments: [ConstructorParams.CNT_TOKEN],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
