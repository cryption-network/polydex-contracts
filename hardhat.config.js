require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  networks: {
    localhost: {
      url: "http://localhost:8545", // uses account 0 of the hardhat node to deploy
    },
    mainnet: {
      url: ALCHEMY_API_KEY,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    rinkeby: {
      url: ALCHEMY_API_KEY,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    kovan: {
      url: ALCHEMY_API_KEY,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    ropsten: {
      url: ALCHEMY_API_KEY,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    matic: {
      url: ALCHEMY_API_KEY,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    hardhat: {
      forking: {
        url: ALCHEMY_API_KEY,
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
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  }
};

