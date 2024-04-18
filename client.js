#!/usr/bin/env node

const b4a = require('b4a')
const goodbye = require('graceful-goodbye')
const idEncoding = require('hypercore-id-encoding')
const pino = require('pino')

const { ProxyClient } = require('./index')

function loadConfig () {
  const rawBootstrap = process.env.P2PROXY_BOOTSTRAP
  const bootstrap = rawBootstrap
    ? [{
        host: rawBootstrap.split(':')[0],
        port: parseInt(rawBootstrap.split(':')[1])
      }]
    : null

  const port = parseInt(process.env.P2PROXY_PORT || 0)

  const rawSeed = process.env.P2PROXY_SEED
  if (!rawSeed || !idEncoding.isValid(rawSeed)) {
    console.error('P2PROXY_SEED must be set to a valid seed')
    process.exit(1)
  }
  const seed = idEncoding.decode(rawSeed)

  const config = {
    port,
    seed,
    bootstrap,
    keepAlive: 5000,
    host: '127.0.0.1',
    logLevel: 'info'
  }

  return config
}

async function main () {
  const config = loadConfig()
  const logger = pino({ level: config.logLevel })

  const { port, seed, bootstrap, keepAlive, host } = config

  if (bootstrap) {
    logger.warn(`Using non-default bootstrap: ${bootstrap[0].host}:${bootstrap[0].port}`)
  }

  const proxy = new ProxyClient(
    seed, port, host, { bootstrap, keepAlive }
  )

  proxy.on('connection', ({ id, remoteAddress, remotePort }) => {
    logger.info(`Opened connection ${id} with ${remoteAddress}:${remotePort}`)
  })
  proxy.on('connection-close', ({ id, remoteAddress, remotePort }) => {
    logger.info(`Closed connection ${id} with ${remoteAddress}:${remotePort}`)
  })

  goodbye(async () => {
    logger.info('Shutting down')
    if (proxy.opened) await proxy.close()
    logger.info('Shut down')
  })

  logger.info('Starting proxy')
  await proxy.ready()

  const address = `${proxy.address.address}:${proxy.address.port}`
  logger.info(`The proxy client is listening at ${address}`)

  logger.info(`Public key: ${b4a.toString(proxy.publicKey, 'hex')}`)
}

main()
