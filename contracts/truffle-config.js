const PRIVATE_KEY =
  "2ff6eb414b6179a4dac20d8f98bff5278a0ace5d3deb72ba81bb5157e04ff677";
const RPC = "https://rpc-mumbai.matic.today";
var PrivateKeyProvider = require("truffle-privatekey-provider");
 
module.exports = {
  // Uncommenting the defaults below
  // provides for an easier quick-start with Ganache.
  // You can also follow this format for other networks;
  // see <http://truffleframework.com/docs/advanced/configuration>
  // for more details on how to specify configuration options!
  //
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    matic: {
      provider: () => new PrivateKeyProvider(PRIVATE_KEY,RPC),
      network_id: 80001,
      confirmations: 1,
      timeoutBlocks: 200,
      skipDryRun: true,
      networkCheckTimeout: "10000000",
    },
    //  test: {
    //    host: "127.0.0.1",
    //    port: 7545,
    //    network_id: "*"
    //  }
  },
  //
  compilers: {
    solc: {
      version: "0.6.12",
      optimizer: { enabled: true, runs: 200 },
    },
  },
};
