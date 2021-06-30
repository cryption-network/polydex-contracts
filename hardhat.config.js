require("dotenv").config();
require("@nomiclabs/hardhat-waffle");

const PRIVATE_KEY = 'dcd277861d2a5f467504170ae6417161dac1abbd1bbd579c7327824e32dc6996';

module.exports = {
  networks: {
    localhost: {
      url: "http://localhost:8545", // uses account 0 of the hardhat node to deploy
    },
    matic: {
      url: 'https://rpc-mainnet.matic.network',
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1 * 1000000000  // 1 gwei
    },
    mumbai: {
      url: `https://rpc-mumbai.maticvigil.com`,
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 1 * 1000000000  // 1 gwei
    }
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
      }
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  }
};

