const hre = require("hardhat");

async function main() {
  // We get the contract to deploy
  const RewardManagerFactory = await hre.ethers.getContractFactory("RewardManagerFactory");
  const rewardManagerFactory = await RewardManagerFactory.deploy();

  console.log("RewardManagerFactory deployed at:", rewardManagerFactory.address);

  await rewardManagerFactory.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: rewardManagerFactory.address
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });