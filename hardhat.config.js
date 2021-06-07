require("dotenv").config();
const { utils, ethers } = require("ethers");
const fs = require("fs");
const chalk = require("chalk");

require("@nomiclabs/hardhat-waffle");

const defaultNetwork = "hardhat"; // "hardhat" for tests
const INFURA_API = process.env.INFURAKEY;
const PRIVATE_KEY = process.env.PRIVATEKEY;

module.exports = {
  defaultNetwork,
  networks: {
    localhost: {
      url: "http://localhost:8545", // uses account 0 of the hardhat node to deploy
    },
    mainnet: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    rinkeby: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    kovan: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    ropsten: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    matic: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    hardhat: {
      forking: {
        url: INFURA_API,
        chainId: 42,
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.7.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

task("accounts", "Prints the list of accounts", async () => {
  if (defaultNetwork === "localhost") {
    const provider = new ethers.providers.JsonRpcProvider(
      "http://127.0.0.1:8545/"
    );
    const accounts = await provider.listAccounts();
    for (let i = 0; i < accounts.length; i++) {
      const accountBalance = await provider.getBalance(accounts[i]);
      console.log(
        "📄",
        chalk.cyan(accounts[i]),
        "💸",
        chalk.magenta(utils.formatEther(accountBalance), "ETH")
      );
    }
    console.log("\n");
  } else {
    console.log(
      " ⚠️  This task only runs on JsonRpcProvider running a node at " +
        chalk.magenta("localhost:8545") +
        "\n"
    );
  }
});
