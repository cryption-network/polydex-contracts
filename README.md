# PolyDEX

Contract are deployed on Matic Mumbai Testnet(80001)

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

NOTE : Make sure to update FactoryAddress in addresses.json & init code hash in PolydexLibrary before deploying Polydex Router

npm run deployRouter:test
```

## Deployed Contracts / Hash

- CryptionNetworkToken(CNT) - https://explorer-mumbai.maticvigil.com/address/0xCda600560dBFb638D1acd860e0A33d57874931E9

- PolydexFactory - https://explorer-mumbai.maticvigil.com/address/0xbC4e4924fbf2E94FF1Db6A1074A24d484a64069E

- PolydexPair init code hash - `8cb41b27c88f8934c0773207afb757d84c4baa607990ad4a30505e42438d999a`

- PolydexRouter - https://explorer-mumbai.maticvigil.com/address/0xEAbdb225629a774a6efCEbeFDF673a7F4D7feb71

- WMATIC - https://explorer-mumbai.maticvigil.com/address/0x608b868Cc04cb70447eCAE7C12A847A4b8cB6Ec8

- DAI - https://explorer-mumbai.maticvigil.com/address/0x6cA0Ad12Bb5191823cb0B44199dB6341b971976b

- USDT - https://explorer-mumbai.maticvigil.com/address/0xBA6fc2C28844c129c4e5b9116095881fE4f5584c

- ETH - https://explorer-mumbai.maticvigil.com/address/0xf2DEF4fD74149231A45d6D5dDC4e5B38F7584E26

- Farm - https://explorer-mumbai.maticvigil.com/address/0xC04c845a10B08A0A17A8be8d7c08E450A3cdDaBd

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
