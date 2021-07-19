require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MATIC_NODE_API = process.env.MATIC_NODE_API;

module.exports = {
  networks: {
    localhost: {
      url: "http://localhost:8545", // uses account 0 of the hardhat node to deploy
    },
    matic: {
      url: MATIC_NODE_API,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    mumbai: {
      url: `https://rpc-mumbai.maticvigil.com`,
      accounts: [`0x${PRIVATE_KEY}`]
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
    ],
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
