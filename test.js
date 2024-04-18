const { spawn } = require('child_process')
const { once } = require('events')
const path = require('path')
const http = require('http')
const createTestnet = require('hyperdht/testnet')
const test = require('brittle')
const HyperDHT = require('hyperdht')
const b4a = require('b4a')

const SERVER_EXECUTABLE = path.join(__dirname, 'server.js')
const CLIENT_EXECUTABLE = path.join(__dirname, 'client.js')

const DEBUG = false

test('Can proxy ', async t => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const portToProxy = await setupDummyServer(t.teardown)
  const seed = 'a'.repeat(64)

  await setupProxyServer(portToProxy, seed, bootstrap, t)
  const clientAddress = await setupProxyClient(seed, bootstrap, t, { isPrivate: true })

  const res = await request(`http://${clientAddress}`)
  t.is(res.data, 'You got served', 'Proxy works')
})

test('Cannot access server with public key', async t => {
  t.plan(2)
  const { bootstrap } = await createTestnet(3, t.teardown)
  const portToProxy = await setupDummyServer(t.teardown)
  const seed = 'a'.repeat(64)
  await setupProxyServer(portToProxy, seed, bootstrap, t)

  const keypair = HyperDHT.keyPair(b4a.from(seed, 'hex'))

  {
    const dht = new HyperDHT({ bootstrap })
    const socket = dht.connect(keypair.publicKey)
    socket.on('open', () => t.fail('Should not be able to connect due to firewall'))
    socket.on('error', async (e) => {
      if (DEBUG) console.log(e)
      t.pass('could not connect')
      await dht.destroy()
    })
  }

  {
    const dht = new HyperDHT({ bootstrap, seed: b4a.from(seed, 'hex') })
    const socket = dht.connect(keypair.publicKey)
    socket.on('open', async () => {
      t.pass('Sanity check: opened socket when using same seed')
      await dht.destroy()
    })
    socket.on('error', e => t.fail('unexpected error'))
  }
})

async function setupDummyServer (teardown) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('You got served')
  })
  teardown(() => server.close())

  server.listen({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  return server.address().port
}

async function setupProxyServer (portToProxy, seed, bootstrap, t) {
  const setupServer = spawn('node', [SERVER_EXECUTABLE], {
    env: {
      ...process.env,
      P2PROXY_PORT: portToProxy,
      P2PROXY_SEED: seed,
      P2PROXY_BOOTSTRAP: `${bootstrap[0].host}:${bootstrap[0].port}`
    }
  })
  t.teardown(() => setupServer.kill('SIGKILL'))

  setupServer.stderr.on('data', (data) => {
    console.error(data.toString())
    t.fail('Failed to setup proxy server')
  })

  await new Promise(resolve => {
    setupServer.stdout.on('data', (data) => {
      if (DEBUG) console.log(data.toString())
      if (data.includes('The proxy server is listening')) {
        resolve()
      }
    })
  })
}

async function setupProxyClient (seed, bootstrap, t, { isPrivate = false } = {}) {
  const setupClient = spawn('node', [CLIENT_EXECUTABLE], {
    env: {
      ...process.env,
      P2PROXY_SEED: seed,
      P2PROXY_BOOTSTRAP: `${bootstrap[0].host}:${bootstrap[0].port}`
    }
  })
  t.teardown(() => setupClient.kill('SIGKILL'))

  setupClient.stderr.on('data', (data) => {
    console.error(data.toString())
    t.fail('Failed to setup proxy client')
  })

  const clientAddress = await new Promise(resolve => {
    setupClient.stdout.on('data', (data) => {
      const msg = data.toString()

      if (DEBUG) console.log(msg)
      if (msg.includes('The proxy client is listening')) {
        const address = msg.match('127.0.0.1:[0-9]+')[0]
        resolve(address)
      }
    })
  })

  return clientAddress
}

async function request (link, { msTimeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(link, {
      headers: {
        Connection: 'close'
      }
    })

    req.setTimeout(msTimeout,
      () => {
        reject(new Error('Request timeout'))
        req.destroy()
      }
    )

    req.on('error', reject)
    req.on('response', function (res) {
      let buf = ''

      res.setEncoding('utf-8')

      res.on('data', function (data) {
        buf += data
      })

      res.on('end', function () {
        resolve({ status: res.statusCode, data: buf })
      })
    })
  })
}
