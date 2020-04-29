import express from 'express'
import morgan from 'morgan'
import Web3 from 'web3'
import { CategoryServiceFactory, CategoryConfiguration, Category, LogLevel } from 'typescript-logging'
import { OrderbookFetcher } from './orderbook_fetcher'
import { getHops } from './utilities'
import { withOrderBookMetrics, withBuyAmountEstimationMetrics, createMetricsMiddleware } from './metrics'
import * as yargs from 'yargs'
import workerpool from 'workerpool'
import path from 'path'
import os from 'os'

const HTTP_STATUS_UNIMPLEMENTED = 501

const argv = yargs
  .env(true)
  .option('ethereum-node-url', {
    describe: 'RPC endpoint to connect to',
    demand: true,
  })
  .option('page-size', {
    describe: 'The number of orders to fetch per page',
    default: 500,
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
  .option('num-threads', {
    describe: 'The number of threads to use for request handling.',
    default: os.cpus().length,
  })
  .option('max-queue-size', {
    describe: 'The maximum number of requests to queue when all threads are occupied.',
    default: os.cpus().length * 2,
  })
  .option('base-path', {
    describe: 'Base path for the Public API',
    default: '/api/v1',
  })
  .option('verbosity', {
    describe: 'log level',
    choices: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    default: 'INFO',
  }).argv

const {
  'ethereum-node-url': ethereumNodeUrl,
  'page-size': pageSize,
  port,
  'max-hops': maxHops,
  'poll-frequency': pollFrequency,
  'price-rounding-buffer': priceRoundingBuffer,
  'num-threads': numThreads,
  'base-path': basePath,
  'max-queue-size': maxQueueSize,
  verbosity,
} = argv

CategoryServiceFactory.setDefaultConfiguration(new CategoryConfiguration(LogLevel.fromString(verbosity)))
const logger = CategoryServiceFactory.getLogger(new Category('dex-price-estimation'))

logger.info({
  msg:
    'Configuration ' +
    JSON.stringify(
      {
        ethereumNodeUrl,
        pageSize,
        port,
        maxHops,
        pollFrequency,
        priceRoundingBuffer,
        numThreads,
        basePath,
        verbosity,
      },
      null,
      2,
    ),
})

export const app = express()

const router = express.Router()
app.use(morgan('tiny'))
app.use(createMetricsMiddleware({ basePath }))
app.use(basePath + '/', router)

const web3 = new Web3(ethereumNodeUrl as string)

const poolOptions = {
  minWorkers: numThreads,
  maxWorkers: numThreads,
  maxQueueSize: maxQueueSize,
}
export const pool = workerpool.pool(path.join(__dirname, '../build/worker.js'), poolOptions)

export const orderbooksFetcher = new OrderbookFetcher(web3, pageSize, pollFrequency, logger)

router.get('/markets/:base-:quote', withOrderBookMetrics(async (req, res) => {
  if (!req.query.atoms) {
    res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
    return
  }
  const serialized = orderbooksFetcher.serializeOrderbooks()
  const result = await pool.exec('markets', [
    serialized,
    req.params.base,
    req.params.quote,
    getHops(req, maxHops),
  ])
  res.json(result)
}))

router.get('/markets/:base-:quote/estimated-buy-amount/:quoteAmount', withBuyAmountEstimationMetrics(async (req, res) => {
  if (!req.query.atoms) {
    res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
    return
  }
  const serialized = orderbooksFetcher.serializeOrderbooks()
  const result = await pool.exec('estimatedBuyAmount', [
    serialized,
    req.params.base,
    req.params.quote,
    getHops(req, maxHops),
    req.params.quoteAmount,
    priceRoundingBuffer,
  ])
  res.json(result)
}))


export const server = app.listen(port, () => {
  logger.info(`server started at http://localhost:${port}`)
})
