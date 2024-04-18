#!/usr/bin/env node

const b4a = require('b4a')
const goodbye = require('graceful-goodbye')
const idEncoding = require('hypercore-id-encoding')
const pino = require('pino')

const { ProxyServer } = require('./index')

function loadConfig () {
  const rawBootstrap = process.env.P2PROXY_BOOTSTRAP
  const bootstrap = rawBootstrap
    ? [{
        host: rawBootstrap.split(':')[0],
        port: parseInt(rawBootstrap.split(':')[1])
      }]
    : null

  if (!process.env.P2PROXY_PORT) {
    console.error('P2PROXY_PORT must be set to the port you wish to proxy')
    process.exit(1)
  }
  const port = parseInt(process.env.P2PROXY_PORT)

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

  const proxy = new ProxyServer(
    seed, port, host, { logger, keepAlive, bootstrap }
  )
  proxy.on('connection', ({ id, remotePublicKey }) => {
    logger.info(`Opened connection ${id} with ${b4a.toString(remotePublicKey, 'hex')}`)
  })
  proxy.on('connection-close', ({ id, remotePublicKey }) => {
    logger.info(`Closed connection ${id} with ${b4a.toString(remotePublicKey, 'hex')}`)
  })

  goodbye(async () => {
    logger.info('Shutting down')
    if (proxy.opened) await proxy.close()
    logger.info('Shut down')
  })

  logger.info('Starting proxy')
  await proxy.ready()
  logger.info('The proxy server is listening. Connect by running a client with the same seed.')

  const address = proxy.address
  logger.info(`Public key: ${b4a.toString(address.publicKey, 'hex')}`)
  logger.info(`Address: ${address.host}:${address.port}`)
}

main()
