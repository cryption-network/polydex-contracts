const { Biconomy } = require("@biconomy/mexa");
const { parseEther } = require("ethers/lib/utils");
let sigUtil = require("eth-sig-util");
const { ethers } = require('hardhat')
const apiKey = "RyYn7QsS-.91b98dd9-6503-4ea2-a37c-373dac1cda66";
const web3Provider = new ethers.providers.AlchemyProvider("maticmum", "P3qpHt_ChaTlyCcwyneo184Mg3QIy4lV");
const biconomy = new Biconomy(web3Provider, { apiKey, debug: true });
let ethersProvider = new ethers.providers.Web3Provider(biconomy);
const { toBuffer } = require('ethereumjs-util');
const ethereumJSUtils = require('ethereumjs-util');


const farmContractAddress = "0x3e74c77446cab24f1f74ddacf2f4f98d7019bdc1";

// let contractInterface = new ethers.utils.Interface();

const getSignatureParameters = signature => {
  if (!ethers.utils.isHexString(signature)) {
    throw new Error(
      'Given value "'.concat(signature, '" is not a valid hex string.')
    );
  }
  var r = signature.slice(0, 66);
  var s = "0x".concat(signature.slice(66, 130));
  var v = "0x".concat(signature.slice(130, 132));
  v = ethers.BigNumber.from(v).toNumber();
  if (![27, 28].includes(v)) v += 27;
  return {
    r: r,
    s: s,
    v: v
  };
};

const constructMetaTransactionMessage = (nonce, salt, functionSignature, contractAddress) => {
  return ethers.utils.soliditySha256(
    ["uint256", "address", "bytes"],
    [nonce, contractAddress, new Buffer(functionSignature, 'utf-8')]
  );
}

async function main() {

  const accounts = await ethers.getSigners();

  const deployer = accounts[0];
  const FARM = await ethers.getContractFactory('Farm');
  console.log('biconomy.getSignerByAddress(deployer.address) ', biconomy.getSignerByAddress(deployer.address));
  const farmInstance = new ethers.Contract(farmContractAddress, FARM.interface, biconomy.getSignerByAddress(deployer.address));
  const nonce = await farmInstance.callStatic.getNonce(deployer.address);

  console.log('nonce ', nonce);

  let message = {
    nonce: "",
    from: "",
    functionSignature: "",
  };

  message.nonce = parseInt(nonce);
  message.from = deployer.address;

  const funcSignature = farmInstance.interface.encodeFunctionData("deposit", [0, parseEther("1")]);

  message.functionSignature = funcSignature;

  const domainType = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "verifyingContract", type: "address" },
    // { name: "chainId", type: "uint256" },
    { name: "salt", type: "bytes32" },
  ];
  const metaTransactionType = [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "functionSignature", type: "bytes" },
  ];

  const domainDataBar = {
    name: "Farm",
    version: "1",
    verifyingContract: farmContractAddress,
    // chainId: 80001,
    salt: ethers.utils.hexZeroPad((ethers.BigNumber.from(80001)).toHexString(), 32)
  };

  const plainData = {
    types: {
      EIP712Domain: domainType,
      MetaTransaction: metaTransactionType,
    },
    domain: domainDataBar,
    primaryType: "MetaTransaction",
    message,
  };

  const dataToSign = JSON.stringify({
    types: {
      EIP712Domain: domainType,
      MetaTransaction: metaTransactionType,
    },
    domain: domainDataBar,
    primaryType: "MetaTransaction",
    message,
  });

  // const messageToSign = constructMetaTransactionMessage(nonce.toNumber(), domainDataBar.chainId, funcSignature, deployer.address);

  console.log('funcSignature ', funcSignature);

  // console.log('sanitized data : ', sigUtil.TypedDataUtils.sanitizeData(plainData));

  // const signature = await deployer.signMessage(dataToSign);
  const privateKey = "";
  let wallet = new ethers.Wallet(privateKey);

  console.log('wallet ', wallet.address);

  const privateKeyBuffer = new Buffer.from(privateKey, 'hex');
  const signature = sigUtil.signTypedMessage(privateKeyBuffer, { data: plainData }, 'V3');

  console.log('signature ', signature);

  const { v, r, s } = getSignatureParameters(signature);


  let rawTx, tx;
  rawTx = {
    to: farmContractAddress,
    data: farmInstance.interface.encodeFunctionData("executeMetaTransaction", [deployer.address, funcSignature, r, s, v]),
    from: deployer.address
  };
  tx = await wallet.signTransaction(rawTx);

  let transactionHash;

  try {
    let receipt = await ethersProvider.sendTransaction(tx);
    console.log(receipt);
  } catch (error) {
    /*Ethers check the hash from user's signed tx and hash returned from Biconomy
    Both hash are expected to be different as biconomy send the transaction from its relayers*/

    // You could also refer to https://github.com/bcnmy/metatx-standard/blob/kovan-demo-ethers-backend/example/react-ui/src/App.js
    if (error.returnedHash && error.expectedHash) {
      console.log("Transaction hash : ", error.returnedHash);
      transactionHash = error.returnedHash;
    }
    else {
      console.log(error);
      // showErrorMessage("Error while sending transaction");
    }
  }

  if (transactionHash) {
    // display transactionHash
    let receipt = await ethersProvider.waitForTransaction(transactionHash);
    console.log(receipt);
    //show Success Message
  } else {
    // showErrorMessage("Could not get transaction hash");
  }


  // const executeMetaTx = await fixedProductMarketMakerInstance.connect(deployer).executeMetaTransaction(
  //   deployer.address,
  //   funcSignature,
  //   r,
  //   s,
  //   v
  // );

  // console.log('receipt : ', await executeMetaTx.wait());

  // await ygnStakerAddress.enter
  // awa
  // await ygnStakerInstance.
  // console.log('accounts ', accounts);
}





main().then((result) => {
  console.log(result);

}).catch((err) => {
  console.log(err);
})