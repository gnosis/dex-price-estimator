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
  describe('GET /markets/', () => {
    it('Returns an non empty orderbook for valid token pairs', async () => {
      const orderbook = (await request(app).get('/api/v1/markets/1-7?atoms=true')).body
      expect(orderbook.bids.length).toBeTruthy()
      expect(orderbook.asks.length).toBeTruthy()
    })

    it('Only implements atom based amounts for now', async () => {
      const estimate = await request(app).get('/api/v1/markets/1-7')
      expect(estimate.status).toBe(501)
    })
  })

  describe('GET /markets/.../estimated-buy-amount', () => {
    it('Returns the estimated buy amount denominated in base tokens', async () => {
      const estimate = (
        await request(app).get('/api/v1/markets/1-7/estimated-buy-amount/1000000000000000000?atoms=true')
      ).body
      expect(estimate.baseTokenId).toBe('1')
      expect(estimate.quoteTokenId).toBe('7')
      expect(estimate.buyAmountInBase).toBeGreaterThan(0)
      expect(estimate.sellAmountInQuote).toBe(1000000000000000000)
    })

    it('Only implements atom based amounts for now', async () => {
      const estimate = await request(app).get('/api/v1/markets/1-7/estimated-buy-amount/1000000000000000000')
      expect(estimate.status).toBe(501)
    })
  })

  afterAll(() => {
    orderbooksFetcher.terminate()
    server.close()
  })
})
