import { Request } from 'express'

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
