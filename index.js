const { once } = require('events')
const net = require('net')
const ReadyResource = require('ready-resource')
const HyperDHT = require('hyperdht')
const { connPiper } = require('hyper-cmd-lib-net')
const b4a = require('b4a')

class ProxyServer extends ReadyResource {
  constructor (seed, port, host, { keepAlive = 5000, bootstrap = null }) {
    super()

    this.dht = new HyperDHT(
      { bootstrap, connectionKeepAlive: keepAlive, seed }
    )

    const firewall = (remotePublicKey) => {
      return !b4a.equals(
        remotePublicKey,
        this.dht.defaultKeyPair.publicKey
      )
    }

    this.connectionCounter = 0
    const connHandler = (socket) => {
      connPiper(
        socket,
        () => {
          const id = this.connectionCounter++
          const remotePublicKey = socket.remotePublicKey

          this.emit('connection', { id, remotePublicKey })

          socket.once('close', () => {
            this.emit('connection-close', { id, remotePublicKey })
          })

          return net.connect({ port, host, allowHalfOpen: true })
        },
        { isServer: true }
      )
    }

    this.server = this.dht.createServer(
      { firewall, reusableSocket: true }, connHandler
    )
  }

  async _open () {
    await this.server.listen()
  }

  get address () {
    return this.server.address()
  }
}

class ProxyClient extends ReadyResource {
  constructor (seed, port, host, { bootstrap = null, keepAlive = 5000 } = {}) {
    super()

    this.port = port
    this.host = host

    this.dht = new HyperDHT(
      { bootstrap, connectionKeepAlive: keepAlive, seed }
    )

    this.connectionCounter = 0

    const connHandler = (socket) => {
      const id = this.connectionCounter++
      const remoteAddress = socket.remoteAddress
      const remotePort = socket.remotePort

      this.emit('connection', {
        remoteAddress,
        remotePort,
        id
      })

      socket.on('close', () => {
        this.emit('connection-close', {
          remoteAddress,
          remotePort,
          id
        })
      })

      return connPiper(
        socket,
        () => {
          const stream = this.dht.connect(
            b4a.from(this.dht.defaultKeyPair.publicKey, 'hex'),
            { reusableSocket: true }
          )
          return stream
        }
      )
    }

    this.proxy = net.createServer(
      { allowHalfOpen: true },
      connHandler
    )
  }

  async _open () {
    const listenProm = once(this.proxy, 'listening')
    this.proxy.listen(this.port, this.host)
    await listenProm
  }

  async _close () {
    this.proxy.close()
    await once(this.proxy, 'close')

    await this.dht.destroy()
  }

  get publicKey () {
    return this.dht.defaultKeyPair.publicKey
  }

  get address () {
    return this.proxy.address()
  }
}

module.exports = { ProxyServer, ProxyClient }
