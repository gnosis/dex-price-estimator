import BN from 'bn.js'
import Web3 from 'web3'
import { Fraction, Orderbook, OrderbookJson, Offer, IndexedOrder, StreamedOrderbook, InvalidAuctionStateError } from '@gnosis.pm/dex-contracts'
import { BatchExchangeViewer } from '@gnosis.pm/dex-contracts/build/types/BatchExchangeViewer'
import { CategoryServiceFactory, Category } from 'typescript-logging'

import { withOrderBookFetcherMetrics } from './metrics'

const logger = CategoryServiceFactory.getLogger(new Category('orderbook-fetcher'))
const streamedLogger = CategoryServiceFactory.getLogger(new Category('streamed-orderbook'))

export class OrderbookFetcher {
  orderbooks: Map<string, Orderbook> = new Map()
  encodedOrders: Uint8Array = new Uint8Array()
  batchExchangeViewer: BatchExchangeViewer | null = null
  timeoutId: NodeJS.Timeout | null = null

  constructor(readonly web3: Web3, pollFrequency: number) {
    let orderbook: StreamedOrderbook | undefined
    const poll = withOrderBookFetcherMetrics(async () => {
      try {
        logger.info('Fetching orderbook updates...')
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
        const [orderbooks, encodedOrders] = updateOrderbooks(orderbook)
        this.orderbooks = orderbooks
        this.encodedOrders = encodedOrders

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

function updateOrderbooks(orderbook: StreamedOrderbook)
  : [Map<string, Orderbook>, Uint8Array] {
  const orderbooks = new Map()
  const encodedOrders: number[] = []
  for (const item of orderbook.getOpenOrders()) {
    const order: IndexedOrder<BN> =
    {
      ...item,
      sellTokenBalance: new BN(item.sellTokenBalance.toString()),
      priceNumerator: new BN(item.priceNumerator.toString()),
      priceDenominator: new BN(item.priceDenominator.toString()),
      remainingAmount: new BN(item.remainingAmount.toString()),
    }
    addItemToOrderbooks(orderbooks, order)
    addItemToEncodedOrders(encodedOrders, order)
  }
  return [orderbooks, Uint8Array.from(encodedOrders)]
}

function addItemToEncodedOrders(appendTo: number[], order: IndexedOrder<BN>) {
  // Remove '0x'
  appendTo.push(...(new BN(order.user.slice(2), 16).toArray('be', 20)))
  appendTo.push(...(order.sellTokenBalance.toArray('be', 32)))
  appendTo.push(...(new BN(order.buyToken).toArray('be', 2)))
  appendTo.push(...(new BN(order.sellToken).toArray('be', 2)))
  appendTo.push(...(new BN(order.validFrom).toArray('be', 4)))
  appendTo.push(...(new BN(order.validUntil).toArray('be', 4)))
  appendTo.push(...(order.priceNumerator.toArray('be', 16)))
  appendTo.push(...(order.priceDenominator.toArray('be', 16)))
  appendTo.push(...(order.remainingAmount.toArray('be', 16)))
  appendTo.push(...(new BN(order.orderId).toArray('be', 2)))
}

function addItemToOrderbooks(orderbooks: Map<string, Orderbook>, item: IndexedOrder<BN>) {
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
