import { Registry, Counter, collectDefaultMetrics, Histogram } from 'prom-client'

const METRIC_PREFIX = 'dex_price_estimator_'
const BUY_AMOUNT_ESTIMATION_METRIC = METRIC_PREFIX + 'buy_amount_estimation'
const ORDER_BOOK_METRIC = METRIC_PREFIX + 'order_book'
const ORDER_BOOK_FETCHER_METRIC = METRIC_PREFIX + 'order_book_fetcher'

export const register = new Registry()
const baseMetricConfig = { registers: [register] }
const marketsMetricConfig = { ...baseMetricConfig, labelNames: ['base', 'quote', 'hops'] }

// Metrics for get-estimated-buy amount
export const buyAmountEstimationMetrics = {
  totalCount: new Counter({
    name: BUY_AMOUNT_ESTIMATION_METRIC + '_requests_total',
    help: 'Total requests of the buy amount estimation',
    ...baseMetricConfig,
  }),

  count: new Counter({
    name: BUY_AMOUNT_ESTIMATION_METRIC + '_requests',
    help: 'Requests of the buy amount estimation by market and hops',
    ...marketsMetricConfig,
  }),

  errorsCount: new Counter({
    name: BUY_AMOUNT_ESTIMATION_METRIC + '_error_total',
    help: 'Number of failed requests of the buy amount estimation',
    ...marketsMetricConfig,
  }),

  durationsTotals: new Histogram({
    name: BUY_AMOUNT_ESTIMATION_METRIC + '_duration_seconds_total',
    help: 'Request duration of the buy amount estimation in seconds',
    ...baseMetricConfig,
  }),

  durations: new Histogram({
    name: BUY_AMOUNT_ESTIMATION_METRIC + '_duration_seconds',
    help: 'Request duration of the buy amount estimation in seconds by market and hops',
    ...marketsMetricConfig,
  }),
}

export const orderBookMetrics = {
  totalCount: new Counter({
    name: ORDER_BOOK_METRIC + '_requests_total',
    help: 'Total requests for the order book',
    ...baseMetricConfig,
  }),

  count: new Counter({
    name: ORDER_BOOK_METRIC + '_requests',
    help: 'Requests for the order book by market and hops',
    ...marketsMetricConfig,
  }),

  errorsCount: new Counter({
    name: ORDER_BOOK_METRIC + '_error_total',
    help: 'Number of failed requests for the order book',
    ...marketsMetricConfig,
  }),

  durationsTotals: new Histogram({
    name: ORDER_BOOK_METRIC + '_duration_seconds_total',
    help: 'Requests duration for the order book in seconds',
    ...baseMetricConfig,
  }),

  durations: new Histogram({
    name: ORDER_BOOK_METRIC + '_duration_seconds',
    help: 'Requests duration for the order book in seconds by market and hops',
    ...marketsMetricConfig,
  }),
}

export const orderBookFetcher = {
  totalCount: new Counter({
    name: ORDER_BOOK_FETCHER_METRIC + '_total',
    help: 'Total number of queries for the on-chain order book',
    ...baseMetricConfig,
  }),

  errorsCount: new Counter({
    name: ORDER_BOOK_FETCHER_METRIC + '_error_total',
    help: 'Total number of failed queries for the on-chain order book',
    ...baseMetricConfig,
  }),

  durationsTotals: new Histogram({
    name: ORDER_BOOK_FETCHER_METRIC + '_duration_seconds',
    help: 'Query duration for the on-chain order book in seconds',
    ...marketsMetricConfig,
  }),
}

if (process.env.PROMETHEUS_COLLECT_DEFAULT_METRICS !== 'false') {
  collectDefaultMetrics({ register, prefix: METRIC_PREFIX })
}