import express from 'express'
const app = express()
const port = 8080 // default port to listen

/* tslint:disable:no-unused-expression */

// define a route handler for the default home page
app.get('/', (_, res) => {
  res.send('Hello world!')
})

// start the Express server
app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`server started at http://localhost:${port}`)
})
