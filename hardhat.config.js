require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");

const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  networks: {
    localhost: {
      url: "http://localhost:8545", // uses account 0 of the hardhat node to deploy
    },
    matic: {
      url: "https://rpc-mainnet.matic.network",
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1 * 1000000000, // 1 gwei
    },
    mumbai: {
      url: `https://rpc-mumbai.maticvigil.com`,
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1 * 1000000000, // 1 gwei
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
