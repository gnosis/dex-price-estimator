import express from 'express'
import morgan from 'morgan'
import Web3 from 'web3'
import { CategoryServiceFactory, CategoryConfiguration, Category, LogLevel } from 'typescript-logging'
import { OrderbookFetcher } from './orderbook_fetcher'
import { getHops, executeWithMetrics } from './utilities'
import * as yargs from 'yargs'
import workerpool from 'workerpool'
import path from 'path'
import os from 'os'
import { register, buyAmountEstimationMetrics, orderBookMetrics } from './metrics'

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
  num-threads: ${argv['num-threads']},
}`)

export const app = express()
const router = express.Router()
app.use(morgan('tiny'))
app.use('/api/v1/', router)
const web3 = new Web3(argv['ethereum-node-url'] as string)

const poolOptions = {
  minWorkers: argv['num-threads'],
  maxWorkers: argv['num-threads'],
  maxQueueSize: argv['max-queue-size'],
}
export const pool = workerpool.pool(path.join(__dirname, '../build/worker.js'), poolOptions)

export const orderbooksFetcher = new OrderbookFetcher(web3, argv['page-size'], argv['poll-frequency'], logger)

/* tslint:disable:no-unused-expression */

router.get('/metrics', (_req, res) => {
  res.header('Content-Type', 'text/plain; charset=utf-8')
  res.send(register.metrics())
})

router.get('/markets/:base-:quote', async (req, res) => {
  const { base, quote } = req.params
  const { atoms } = req.query
  const hops = getHops(req, argv['max-hops'])
  const { totalCount, count, errorsCount, durationsTotals, durations } = orderBookMetrics

  executeWithMetrics({
    totalCount,
    count,
    errorsCount,
    durationsTotals,
    durations,
    labelValues: { base, quote, hops },

    runnable: async () => {
      if (!atoms) {
        res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
        return
      }
      const serialized = orderbooksFetcher.serializeOrderbooks()
      const result = await pool.exec('markets', [serialized, base, quote, hops])
      res.json(result)
    },
  })
})

router.get('/markets/:base-:quote/estimated-buy-amount/:quoteAmount', async (req, res) => {
  const { base, quote, quoteAmount } = req.params
  const { atoms } = req.query
  const hops = getHops(req, argv['max-hops'])
  const { totalCount, count, errorsCount, durationsTotals, durations } = buyAmountEstimationMetrics

  executeWithMetrics({
    totalCount,
    count,
    errorsCount,
    durationsTotals,
    durations,
    labelValues: { base, quote, hops },

    runnable: async () => {
      if (!atoms) {
        res.sendStatus(HTTP_STATUS_UNIMPLEMENTED)
        return
      }
      const serialized = orderbooksFetcher.serializeOrderbooks()
      const result = await pool.exec('estimatedBuyAmount', [
        serialized,
        base,
        quote,
        hops,
        quoteAmount,
        argv['price-rounding-buffer'],
      ])
      res.json(result)
    },
  })
})

export const server = app.listen(argv.port, () => {
  logger.info(`server started at http://localhost:${argv.port}`)
})
