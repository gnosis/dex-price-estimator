import Web3 from 'web3'
import { AbiItem } from 'web3-utils'
import { getOpenOrdersPaginated, Fraction, Orderbook, Offer, OrderBN } from '@gnosis.pm/dex-contracts'
import { BatchExchangeViewer } from '@gnosis.pm/dex-contracts/build/types/BatchExchangeViewer'
import batchExchangeViewerAbi from '@gnosis.pm/dex-contracts/build/contracts/BatchExchangeViewer.json'
import { CategoryLogger } from 'typescript-logging'

import { isKeyOf } from './utilities'

const POLL_INTERVAL = 30000
interface Network {
  address: string
}

export class OrderbookFetcher {
  orderbooks: Map<string, Orderbook> = new Map()
  batchExchangeViewer: BatchExchangeViewer | null = null

  constructor(readonly web3: Web3, pageSize: number, logger: CategoryLogger) {
    const poll = async () => {
      try {
        const contract = await this.loadBatchExchangeViewer()
        this.orderbooks = await updateOrderbooks(contract, pageSize, logger)
      } catch (error) {
        logger.error(`Failed to fetch Orderbooks: ${error}`, null)
      }
      setTimeout(poll, POLL_INTERVAL)
    }
    poll()
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
    page.forEach(item => {
      addItemToOrderbooks(orderbooks, item)
    })
  }
  logger.info('Orderbook fetched')
  return orderbooks
}

function addItemToOrderbooks(orderbooks: Map<string, Orderbook>, item: OrderBN) {
  let orderbook = new Orderbook(item.sellToken.toString(), item.buyToken.toString())
  if (!orderbooks.has(orderbook.pair())) {
    orderbooks.set(orderbook.pair(), orderbook)
  }
  // If the orderbook didn't exist we added it
  orderbook = orderbooks.get(orderbook.pair()) as Orderbook
  const price = new Fraction(item.priceNumerator, item.priceDenominator)
  const volume = new Fraction(
    item.remainingAmount.gt(item.sellTokenBalance) ? item.sellTokenBalance : item.remainingAmount,
    1,
  )
  const MIN_TRADEABLE_VOLUME = new Fraction(10000, 1)
  if (volume.gt(MIN_TRADEABLE_VOLUME)) {
    orderbook.addAsk(new Offer(price, volume))
  }
}
