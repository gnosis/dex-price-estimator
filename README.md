[![Build Status](https://travis-ci.org/gnosis/dex-price-estimator.svg?branch=master)](https://travis-ci.org/gnosis/dex-price-estimator)

# Dex Price Estimator

A service estimating feasible sell prices for Gnosis Protocol.

## API

The service exposes two endpoints:

- _GET /markets/\<baseTokenId>-\<quoteTokenId>[?atoms=true]_: returns the transitive orderbook (containing bids and asks) for the given base and quote token
- \_GET /markets/\<baseTokenId>-\<quoteTokenId>/estimated-buy-amount/\<sellAmountInQuoteToken>[?atoms=true]: estimates the buy amount (in base tokens) a user can set as a limit order while still expecting to be matched when selling the given amount of quote token.

If `atoms` is set to true (for now this is the only implemented method) all amounts will be denominated in the smallest available unit (base quantity) of the token.

The token ID for a specific ERC20 address can be queried from the dex [smart contract](https://etherscan.io/address/0x6F400810b62df8E13fded51bE75fF5393eaa841F) using [`tokenAddressToIdMap`](https://github.com/gnosis/dex-contracts/blob/master/contracts/BatchExchange.sol#L401).
A subset of tokens listed can also be found [here](https://github.com/gnosis/dex-js/blob/master/src/tokenList.json)

## Development

### Running the service

Available config params are:

```
Options:
  --version                Show version number                         [boolean]
  --ethereum-node-url      RPC endpoint to connect to                 [required]
  --page-size              The number of orders to fetch per page  [default: 50]
  --port                   Port to bind on                     [default: "8080"]
  --hops                   The number of intermediate orderbooks to look at when
                           computing the transitive one             [default: 2]
  --poll-frequency         The number of milliseconds to wait between two
                           orderbook fetches                    [default: 10000]
  --price-rounding-buffer  The safety margin to subtract from the estimated
                           price, in order to make it more likely to be matched
                                                                [default: 0.001]
  --verbosity              log level
         [choices: "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"] [default:
                                                                         "INFO"]
```

To run the service

```
yarn build
yarn start -- --ethereum-node-url <your endpoint>
```

### Running the tests

```
export ETHEREUM_NODE_URL=<<your endpoint>>
yarn build
yarn test
```
