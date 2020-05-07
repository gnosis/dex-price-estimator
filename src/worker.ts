import BN from 'bn.js'
import workerpool from 'workerpool'
import { OrderbookFetcher } from './orderbook_fetcher'
import { sortOrderbookBySerializedPrice } from './utilities'
import { transitiveOrderbook, Fraction } from '@gnosis.pm/dex-contracts'
import { PriceEstimator } from '@gnosis.pm/dex-pricegraph'

function markets(orderbooksString: string, base: string, quote: string, hops: number) {
  const orderbooks = OrderbookFetcher.deserializeOrderbooks(orderbooksString)
  const transitive = transitiveOrderbook(orderbooks, base, quote, hops)
  const result = sortOrderbookBySerializedPrice(transitive)
  return result
}

function estimatedBuyAmount(
  encodedOrders: Uint8Array,
  base: string,
  quote: string,
  sellAmountInQuote: string,
  priceRoundingBuffer: number,
) {
  let buyAmountInBase = new BN(0)
  try {
    const sellAmountInQuoteNumber = parseInt(sellAmountInQuote)
    const priceEstimator = new PriceEstimator(encodedOrders)
    const price = priceEstimator.estimatePrice(parseInt(base), parseInt(quote), parseInt(sellAmountInQuote))
    priceEstimator.free()
    if (price !== undefined) {
      buyAmountInBase = Fraction.fromNumber(1 - priceRoundingBuffer).mul(Fraction.fromNumber(price)).mul(Fraction.fromNumber(sellAmountInQuoteNumber)).toBN()
    }
  } catch (error) {
    console.log('estimatedBuyAmount error:', error)
  }
  return {
    baseTokenId: base,
    quoteTokenId: quote,
    buyAmountInBase: buyAmountInBase.toString(10),
    sellAmountInQuote,
  }
}

workerpool.worker({
  markets,
  estimatedBuyAmount,
})
