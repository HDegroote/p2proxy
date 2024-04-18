# P2Proxy

A peer-to-peer proxy which can connect firewalled services.

A typical usecase involves:
- Remote machine runs a server on localhost
- Remote machine runs a P2Proxy to that localhost server
- Client machine runs a P2Proxy client to the remote proxy

=> You can now talk to the remote server, through the client machine's proxy.

Discovery and holepunching through firewalls is handled by [Hyperdht](https://github.com/holepunchto/hyperdht).

Communication is end-to-end encrypted between the client and server proxies (thanks to Hyperdht).

The client and server are authenticated through a shared secret.

Disclaimer: this is still fairly experimental software.

## Install

`npm i p2proxy`

## Usage

Arguments and options are read from environment variables.

Seeds are strings of 64 hex characters which should be kept secret. The `hyper-cmd-util-keygen` CLI tool from [hyper-cmd-utils](https://github.com/holepunchto/hyper-cmd-utils) can be used to generate them:

```
hyper-cmd-util-keygen --gen_seed
```

Logs can be piped to pino-pretty for clean display on a CLI (`... | pino-pretty`).

### CLI

Server:

```
P2PROXY_PORT=8080 P2PROXY_SEED=<64-hex-seed> p2proxy-server
```

Client:

```
P2PROXY_PORT=18080 P2PROXY_SEED=<64-hex-seed> p2proxy-client
```

Note: both client and server need to use the same seed. The seed is how they find and authenticate each other.

You can now reach the service running at port 8080 on the remote, by running on the client:
```
curl 127.0.0.1:18080
```

### Docker

See https://hub.docker.com/r/hdegroote/p2proxy-server and https://hub.docker.com/r/hdegroote/p2proxy-client

## Relation With Hypertele

This module is based on [hypertele](https://github.com/bitfinexcom/hypertele).

The main differences are:
- Less options
- Options are passed in as environment variables
- No pub-sub functionality
- Always runs in `--private` mode
- The server and client can be imported, for use in other programs
