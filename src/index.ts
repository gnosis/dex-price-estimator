import { Fraction, transitiveOrderbook } from '@gnosis.pm/dex-contracts'
import express from 'express'
import morgan from 'morgan'
import Web3 from 'web3'
import BN from 'bn.js'
import { CategoryServiceFactory, CategoryConfiguration, Category, LogLevel } from 'typescript-logging'
import { OrderbookFetcher } from './orderbook_fetcher'
import { getHops, sortOrderbookBySerializedPrice } from './utilities'
import * as yargs from 'yargs'

const argv = yargs
  .env(true)
  .option('ethereum-node-url', {
    describe: 'RPC endpoint to connect to',
    demand: true,
  })
  .option('page-size', {
    describe: 'The number of orders to fetch per page',
    default: 50,
  })
  .option('port', {
    describe: 'Port to bind on',
    default: '8080',
  })
  .option('max-hops', {
    describe: 'The maximum number of intermediate orderbooks to look at when computing the transitive one',
    default: 2,
  })
  .option('poll-frequency', {
    describe: 'The number of milliseconds to wait between two orderbook fetches',
    default: 10000,
  })
  .option('price-rounding-buffer', {
    describe: 'The safety margin to subtract from the estimated price, in order to make it more likely to be matched',
    default: 0.001,
  })
  .option('verbosity', {
    describe: 'log level',
    choices: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    default: 'INFO',
  }).argv

const HTTP_STATUS_UNIMPLEMENTED = 501

CategoryServiceFactory.setDefaultConfiguration(new CategoryConfiguration(LogLevel.fromString(argv.verbosity)))
const logger = CategoryServiceFactory.getLogger(new Category('dex-price-estimation'))
logger.info(`Configuration {
  ethereum-node-url: ${argv['ethereum-node-url']},
  max-hops: ${argv['max-hops']},
  poll-frequency: ${argv['poll-frequency']},
  price-rounding-buffer: ${argv['price-rounding-buffer']},
  page-size: ${argv['page-size']},
  verbosity: ${argv.verbosity},
}`)

export const app = express()
const router = express.Router()
app.use(morgan('tiny'))
app.use('/api/v1/', router)
const web3 = new Web3(argv['ethereum-node-url'] as string)

export const orderbooksFetcher = new OrderbookFetcher(web3, argv['page-size'], argv['poll-frequency'], logger)

/* tslint:disable:no-unused-expression */

router.get('/markets/:base-:quote', (req, res) => {
  if (!req.query.atoms) {
    res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
    return
  }
  const transitive = transitiveOrderbook(
    orderbooksFetcher.orderbooks,
    req.params.base,
    req.params.quote,
    getHops(req, argv['max-hops']),
  )
  res.json(sortOrderbookBySerializedPrice(transitive))
})

router.get('/markets/:base-:quote/estimated-buy-amount/:quoteAmount', (req, res) => {
  if (!req.query.atoms) {
    res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
    return
  }
  const transitive = transitiveOrderbook(
    orderbooksFetcher.orderbooks,
    req.params.base,
    req.params.quote,
    getHops(req, argv['max-hops']),
  )
  const sellAmount = new BN(req.params.quoteAmount)
  const estimatedPrice = transitive.priceToBuyBaseToken(new BN(sellAmount))
  if (estimatedPrice) {
    const buyAmountInBase =
      (1 - argv['price-rounding-buffer']) * new Fraction(sellAmount, 1).div(estimatedPrice).toNumber()
    res.json({
      baseTokenId: req.params.base,
      quoteTokenId: req.params.quote,
      buyAmountInBase,
      sellAmountInQuote: parseInt(req.params.quoteAmount),
    })
  } else {
    res.end()
  }
  res.end()
})

export const server = app.listen(argv.port, () => {
  logger.info(`server started at http://localhost:${argv.port}`)
})
