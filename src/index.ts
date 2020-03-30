import { transitiveOrderbook } from '@gnosis.pm/dex-contracts'
import express from 'express'
import morgan from 'morgan'
import Web3 from 'web3'
import { CategoryServiceFactory, CategoryConfiguration, Category, LogLevel } from 'typescript-logging'
import { OrderbookFetcher } from './orderbook_fetcher'
import * as yargs from 'yargs'

const argv = yargs
  .env(true)
  .option('node', {
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
  .option('hops', {
    describe: 'The number of intermediate orderbooks to look at when computing the transitive one',
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

CategoryServiceFactory.setDefaultConfiguration(new CategoryConfiguration(LogLevel.fromString(argv.verbosity)))
const logger = CategoryServiceFactory.getLogger(new Category('dex-price-estimation'))
logger.info(`Configuration {
  node: ${argv.node},
  hops: ${argv.hops},
  poll-frequency: ${argv['poll-frequency']},
  price-rounding-buffer: ${argv['price-rounding-buffer']},
  page-size: ${argv['page-size']},
  verbosity: ${argv.verbosity},
}`)

export const app = express()
app.use(morgan('tiny'))
const web3 = new Web3(argv.node as string)

export const orderbooksFetcher = new OrderbookFetcher(web3, argv['page-size'], argv['poll-frequency'], logger)

/* tslint:disable:no-unused-expression */

app.get('/orderbook', (req, res) => {
  const transitive = transitiveOrderbook(orderbooksFetcher.orderbooks, req.query.base, req.query.quote, argv.hops)
  res.json(JSON.stringify(transitive))
})

app.get('/price', (req, res) => {
  const transitive = transitiveOrderbook(orderbooksFetcher.orderbooks, req.query.base, req.query.quote, argv.hops)
  const estimatedPrice = transitive.priceToSellBaseToken(req.query.sell)
  if (estimatedPrice) {
    res.json(estimatedPrice.toNumber() * (1 - argv['price-rounding-buffer']))
  } else {
    res.end()
  }
  res.end()
})

export const server = app.listen(argv.port, () => {
  logger.info(`server started at http://localhost:${argv.port}`)
})
