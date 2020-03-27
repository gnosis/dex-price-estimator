import { app, orderbooksFetcher, server } from '..'
import request from 'supertest'

function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time))
}

describe('Price Estimation Server', () => {
  beforeAll(async () => {
    // jest tests have a timeout of 30s
    while (orderbooksFetcher.orderbooks.size === 0) {
      await sleep(1000)
    }
  })
  describe('GET /orderbook', () => {
    it('Returns an non empty orderbook for valid token pairs', async () => {
      const result = await request(app).get('/orderbook?base=1&quote=7')
      const orderbook = JSON.parse(result.body)
      expect(orderbook.bids.length).toBeTruthy()
      expect(orderbook.asks.length).toBeTruthy()
    })

    it('Returns an empty orderbook for invalid requests', async () => {
      const result = await request(app).get('/orderbook')
      const orderbook = JSON.parse(result.body)
      expect(orderbook.bids.length).toBeFalsy()
      expect(orderbook.asks.length).toBeFalsy()
    })
  })

  describe('GET /price', () => {
    it('Returns a price valid token pairs', async () => {
      const result = await request(app).get('/price?base=1&quote=7&sell=1000000000000000000')
      expect(parseFloat(result.body)).toBeGreaterThan(0)
    })

    it('Returns no price for invalid requests', async () => {
      const result = await request(app).get('/price')
      expect(parseFloat(result.body)).toBeFalsy()
    })
  })

  afterAll(() => {
    orderbooksFetcher.terminate()
    server.close()
  })
})
