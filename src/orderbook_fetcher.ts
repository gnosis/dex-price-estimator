import BN from 'bn.js'
import Web3 from 'web3'
import { Fraction, Orderbook, OrderbookJson, Offer, Order, StreamedOrderbook, InvalidAuctionStateError } from '@gnosis.pm/dex-contracts'
import { BatchExchangeViewer } from '@gnosis.pm/dex-contracts/build/types/BatchExchangeViewer'
import { CategoryServiceFactory, Category } from 'typescript-logging'

import { withOrderBookFetcherMetrics } from './metrics'

const logger = CategoryServiceFactory.getLogger(new Category('orderbook-fetcher'))
const streamedLogger = CategoryServiceFactory.getLogger(new Category('streamed-orderbook'))

export class OrderbookFetcher {
  orderbooks: Map<string, Orderbook> = new Map()
  batchExchangeViewer: BatchExchangeViewer | null = null
  timeoutId: NodeJS.Timeout | null = null

  constructor(readonly web3: Web3, pollFrequency: number) {
    let orderbook: StreamedOrderbook | undefined
    const poll = withOrderBookFetcherMetrics(async () => {
      try {
        if (orderbook === undefined) {
          logger.debug('Initializing streamed orderbook...')
          orderbook = await StreamedOrderbook.init(web3 as any, {
            debug: (msg) => streamedLogger.debug(msg),
          })
        } else {
          logger.debug('Fetching orderbook updates...')
          await orderbook.update()
        }
        logger.info('Updating orderbooks map...')
        this.orderbooks = updateOrderbooks(orderbook)

        logger.info('Updated orderbook.')
      } catch (error) {
        if (error instanceof InvalidAuctionStateError) {
          orderbook = undefined
        }

        logger.error(`Failed to update orderbooks: ${error}`, null)
      }

      this.timeoutId = setTimeout(poll, pollFrequency)
    })

    poll()
  }

  serializeOrderbooks(): string {
    const o: any = {}
    this.orderbooks.forEach((value, key) => {
      o[key] = value
    })
    return JSON.stringify(o)
  }

  static deserializeOrderbooks(o: string): Map<string, Orderbook> {
    const orderbooks = new Map()
    for (const [key, value] of Object.entries(JSON.parse(o) as OrderbookJson)) {
      orderbooks.set(key, Orderbook.fromJSON(value))
    }
    return orderbooks
  }

  terminate() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
  }
}

function updateOrderbooks(orderbook: StreamedOrderbook) {
  const orderbooks = new Map()
  for (const item of orderbook.getOpenOrders()) {
    addItemToOrderbooks(orderbooks, {
      ...item,
      sellTokenBalance: new BN(item.sellTokenBalance.toString()),
      priceNumerator: new BN(item.priceNumerator.toString()),
      priceDenominator: new BN(item.priceDenominator.toString()),
      remainingAmount: new BN(item.remainingAmount.toString()),
    })
  }
  return orderbooks
}

function addItemToOrderbooks(orderbooks: Map<string, Orderbook>, item: Order<BN>) {
  const MIN_TRADEABLE_VOLUME = new Fraction(10000, 1)
  const volume = new Fraction(
    item.remainingAmount.gt(item.sellTokenBalance) ? item.sellTokenBalance : item.remainingAmount,
    1,
  )
  // Skip problematic orders with tiny amounts or invalid prices
  if (volume.lt(MIN_TRADEABLE_VOLUME) || item.priceDenominator.isZero() || item.priceNumerator.isZero()) {
    return
  }
  const price = new Fraction(item.priceNumerator, item.priceDenominator)

  let orderbook = new Orderbook(item.sellToken.toString(), item.buyToken.toString())
  if (!orderbooks.has(orderbook.pair())) {
    orderbooks.set(orderbook.pair(), orderbook)
  }
  // If the orderbook didn't exist we added it
  orderbook = orderbooks.get(orderbook.pair()) as Orderbook
  orderbook.addAsk(new Offer(price, volume))
}
