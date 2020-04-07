import { Request } from 'express'
import { Orderbook, Offer } from '@gnosis.pm/dex-contracts'

export function isKeyOf<T extends object>(obj: T, possibleKey: keyof any): possibleKey is keyof T {
  return possibleKey in obj
}

export function getHops(request: Request, maxHops: number) {
  if (request.query.hops && parseInt(request.query.hops) < maxHops) {
    return parseInt(request.query.hops)
  } else {
    return maxHops
  }
}

export function sortOrderbookBySerializedPrice(orderbook: Orderbook) {
  const json = orderbook.toJSON()
  json.bids.sort(sortDescending)
  json.asks.sort(sortAscending)
  return json
}

function sortAscending(left: Offer, right: Offer) {
  return left.price.toNumber() - right.price.toNumber()
}

function sortDescending(left: Offer, right: Offer) {
  return sortAscending(left, right) * -1
}
