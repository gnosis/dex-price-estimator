import BN from 'bn.js'
import workerpool from 'workerpool'
import { OrderbookFetcher } from './orderbook_fetcher'
import { sortOrderbookBySerializedPrice } from './utilities'
import { transitiveOrderbook, Fraction } from '@gnosis.pm/dex-contracts'

function markets(orderbooksString: string, base: string, quote: string, hops: number) {
  const orderbooks = OrderbookFetcher.deserializeOrderbooks(orderbooksString)
  const transitive = transitiveOrderbook(orderbooks, base, quote, hops)
  const result = sortOrderbookBySerializedPrice(transitive)
  return result
}

function estimatedBuyAmount(
  orderbooksString: string,
  base: string,
  quote: string,
  hops: number,
  quoteAmount: string,
  priceRoundingBuffer: number,
) {
  const orderbooks = OrderbookFetcher.deserializeOrderbooks(orderbooksString)
  const transitive = transitiveOrderbook(orderbooks, base, quote, hops)
  const sellAmount = new BN(quoteAmount)
  // The orderbook API only allows us to compute a price for selling base tokens. Here, we want to sell quote tokens.
  // Thus, we invert the orderbook, sell the requested amount (now in base) and multiply the computed price with the
  // sell amount in order to compute the buy amount in the original base token. A small rounding buffer is considered
  // to increase the chances of matching the order if placed.
  let estimatedPrice = transitive.inverted().priceToSellBaseToken(new BN(sellAmount))
  if (estimatedPrice === undefined) {
    estimatedPrice = Fraction.fromNumber(0)
  }
  const buyAmountInBase = (1 - priceRoundingBuffer) * new Fraction(sellAmount, 1).mul(estimatedPrice).toNumber()
  return {
    baseTokenId: base,
    quoteTokenId: quote,
    buyAmountInBase: buyAmountInBase,
    sellAmountInQuote: parseInt(quoteAmount),
  }
}

workerpool.worker({
  markets,
  estimatedBuyAmount,
})
