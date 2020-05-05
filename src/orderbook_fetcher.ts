import Web3 from 'web3'
import { AbiItem } from 'web3-utils'
import { getOpenOrdersPaginated, Fraction, Orderbook, Offer, OrderBN } from '@gnosis.pm/dex-contracts'
import { BatchExchangeViewer } from '@gnosis.pm/dex-contracts/build/types/BatchExchangeViewer'
import batchExchangeViewerAbi from '@gnosis.pm/dex-contracts/build/contracts/BatchExchangeViewer.json'
import { CategoryLogger } from 'typescript-logging'

import { isKeyOf } from './utilities'
import { withOrderBookFetcherMetrics } from './metrics'

interface Network {
  address: string
}

export class OrderbookFetcher {
  orderbooks: Map<string, Orderbook> = new Map()
  batchExchangeViewer: BatchExchangeViewer | null = null
  timeoutId: NodeJS.Timeout | null = null

  constructor(readonly web3: Web3, pageSize: number, pollFrequency: number, logger: CategoryLogger) {
    const poll = withOrderBookFetcherMetrics(async () => {
      try {
        const contract = await this.loadBatchExchangeViewer()
        this.orderbooks = await updateOrderbooks(contract, pageSize, logger)
      } catch (error) {
        logger.error(`Failed to fetch Orderbooks: ${error}`, null)
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
    for (const [key, value] of Object.entries(JSON.parse(o))) {
      orderbooks.set(key, Orderbook.fromJSON(value))
    }
    return orderbooks
  }

  terminate() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
  }

  private async loadBatchExchangeViewer(): Promise<BatchExchangeViewer> {
    if (this.batchExchangeViewer) {
      return this.batchExchangeViewer
    }
    const networkId = await this.web3.eth.getChainId()
    if (isKeyOf(batchExchangeViewerAbi.networks, networkId)) {
      this.batchExchangeViewer = new this.web3.eth.Contract(
        batchExchangeViewerAbi.abi as AbiItem[],
        (batchExchangeViewerAbi.networks[networkId] as Network).address,
      ) as BatchExchangeViewer
      return this.batchExchangeViewer
    } else {
      throw new Error(`Contract not deployed on network with ID ${networkId}`)
    }
  }
}

async function updateOrderbooks(contract: BatchExchangeViewer, pageSize: number, logger: CategoryLogger) {
  logger.info('Fetching orderbook')
  const orderbooks = new Map()
  for await (const page of getOpenOrdersPaginated(contract, pageSize)) {
    logger.debug('Page fetched')
    page.forEach((item) => {
      addItemToOrderbooks(orderbooks, item)
    })
  }
  logger.info('Orderbook fetched')
  return orderbooks
}

function addItemToOrderbooks(orderbooks: Map<string, Orderbook>, item: OrderBN) {
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
