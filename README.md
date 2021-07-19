# PolyDEX

Contract are deployed on Polygon(Matic) (ChainID: 147)

Feel free to read the code. More details coming soon.

## Install dependencies

```
npm i
```

## compile

```
npm run compile
```

## deploy Testnet Mumbai

```
npm run deployFactory:test

NOTE : Make sure to update FactoryAddress in constructorParams.json & init code hash in PolydexLibrary before deploying Polydex Router

npm run deployRouter:test
```

## Deployed Contracts / Hash

- MCryptionNetworkToken CNT on Matic ( L2 ): https://polygonscan.com/address/0xD1e6354fb05bF72A8909266203dAb80947dcEccF

- CryptionNetworkToken CNT on Ethereum ( L1 ): https://etherscan.io/address/0x429876c4a6f89fb470e92456b8313879df98b63c

- L1Burner : https://etherscan.io/address/0xe0ece8cca8ce72d2ae862b6c564373268e2a80e9

- L2Burner: https://polygonscan.com/address/0xe0eCe8cCA8ce72d2AE862b6C564373268e2A80E9

- PolydexFactory: https://polygonscan.com/address/0x5bdd1cd910e3307582f213b33699e676e61dead9

- PolydexPair init code hash - `8cb41b27c88f8934c0773207afb757d84c4baa607990ad4a30505e42438d999a`

- PolydexRouter: https://polygonscan.com/address/0xBd13225f0a45BEad8510267B4D6a7c78146Be459

- WETH/WMATIC : https://polygonscan.com/address/0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270

- CNT Staker : https://polygonscan.com/address/0x82C2Fb7410dcfFEd4e9147413BD5005a0a6F58aA

- Converter: https://polygonscan.com/address/0x1fD45D08b609ddD18EA5438903347dfEA3193776

- Farm - TBD

## test output

```
  Farm
    ✓ should set correct state variables (527ms)
    With ERC/LP token added to the field
      ✓ should allow emergency withdraw (673ms)
      ✓ is CNT transfering to farmingcontract (346ms)
      ✓ should give out CNTs only after farming time (1809ms)
      ✓ should not distribute CNTs if no one deposit (1262ms)
      ✓ should distribute CNTs properly for each staker (671ms)
      ✓ should give proper CNTs allocation to each pool (267ms)
      ✓ should stop giving bonus CNTs after the bonus period ends (382ms)

  Elastic Farming
    checking DepsoitFor and withdrawFor functionlity
      ✓ is CNT transfering to farmingcontract (52ms)
      ✓ checking deposit for functionlity (181ms)
      ✓ whitelisted user should only be able to run withdrawFor (272ms)
    Harvest Time Lock
      ✓ reward got unlocked only after harvestInterval (203ms)
      ✓ pending reward give after harvest interval if use withdraw (263ms)

  StakingPool
    ✓ should sucessfully withdraw reward (125ms)
    ✓ should sucessfully withdraw reward when 2 reward tokens are present (305ms)
    ✓ should lock up rewards (68ms)
    ✓ should whiltelist user to withdraw (146ms)
```
