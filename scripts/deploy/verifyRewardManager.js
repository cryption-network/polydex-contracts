const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

//pass params as per needed
const {
  startDistribution,
  endDistribution,
  managerAddress,
} = ConstructorParams.rewardManagers.firstRewardManager;

async function main(startDistribution, endDistribution, managerAddress) {
  // We get the contract to deploy
  const RewardManager = await hre.ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.attach(managerAddress);

  console.log("RewardManager is at:", rewardManager.address);

  const {
    UPFRONT_UNLOCK,
    PREMATURE_PENALTY,
    BONUS_PERCENTAGE,
    BURNER,
    CNT_TOKEN,
  } = ConstructorParams.rewardManagers;

  await hre.run("verify:verify", {
    address: rewardManager.address,
    constructorArguments: [
      CNT_TOKEN,
      startDistribution,
      endDistribution,
      UPFRONT_UNLOCK,
      PREMATURE_PENALTY,
      BONUS_PERCENTAGE,
      BURNER,
    ],
  });
}

main(startDistribution, endDistribution, managerAddress)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
