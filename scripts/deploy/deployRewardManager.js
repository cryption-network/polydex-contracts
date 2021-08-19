const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  // We get the contract to deploy
  const RewardManager = await hre.ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(
    ConstructorParams.CNT_TOKEN,
    ConstructorParams.startAccumulationTime,
    ConstructorParams.endAccumulationTime,
    ConstructorParams.upfrontUnlockPercentage,
    ConstructorParams.preMaturePenaltyPercentage,
    ConstructorParams.L2Burner
  );

  console.log("RewardManager deployed at:", rewardManager.address);

  await rewardManager.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: rewardManager.address,
    constructorArguments: [
      ConstructorParams.CNT_TOKEN,
      ConstructorParams.startAccumulationTime,
      ConstructorParams.endAccumulationTime,
      ConstructorParams.upfrontUnlockPercentage,
      ConstructorParams.preMaturePenaltyPercentage,
      ConstructorParams.L2Burner
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });