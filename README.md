# 🌀 Helix

> A small webserver written from scratch on Node.js raw TCP sockets, currently targeting HTTP/1.1. Other protocol versions are on the roadmap, so the codebase is structured to keep the protocol layer replaceable rather than baked in throughout.

<p align="left">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/HTTP-1.1-005C9F?style=for-the-badge&logo=http&logoColor=white" alt="HTTP/1.1"/>
  <img src="https://img.shields.io/badge/Tests-Vitest-729B1B?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest"/>
  <img src="https://img.shields.io/badge/Status-WIP-yellow?style=for-the-badge" alt="Status: WIP"/>
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="ISC"/>
</p>

---

## ✨ Features

| Layer        | Highlights                                                                     |
|--------------|--------------------------------------------------------------------------------|
| 🔌 **TCP**   | Single-pending accept, buffered writes with backpressure, idle/read/write timeouts |
| 🧱 **Buffer**| Sliding-window `DynamicBuffer` (max 10 MB), exponential growth, amortized compaction |
| 🌐 **HTTP**  | HTTP/1.1 request parsing, fixed-length + chunked bodies, status-line encoding   |
| 🧪 **Tests** | Unit + integration over real localhost sockets, mocked timeouts for fast runs   |

---

## 🏗️ Architecture

Layered, protocol-only — **no Express, no frameworks:**

```text
index.ts
  └─ TCPListener  (port 1234, pauseOnConnect, max 100 connections)
      └─ TCPConnection  (read / write / flush / close / forceClose)
          ├─ SocketReader    (single pending read, timeout, zero-length filter)
          └─ SocketWriter    (buffered writes, 1 MB backpressure, flush retry)
              └─ DynamicBuffer  (sliding-window growable, max 10 MB)

http/server/serveClient.ts
  cutMessage → HttpRequest → getReader → handleRequest → ResponseWriter
```

| Path                         | Contents                                                            |
|------------------------------|---------------------------------------------------------------------|
| 📦 `src/network/mem/`        | `DynamicBuffer`, `BufferError`, byte helpers (`splitBuffer`, `stripBuffer`) |
| 🔌 `src/network/tcp/`        | `TCPListener`, `TCPConnection`, `SocketReader`, `SocketWriter`     |
| 🌐 `src/network/http/`       | Request parsing, body readers, response writer, routing             |

---

## 🚀 Run

```bash
npm install
npx tsx index.ts          # listens on 127.0.0.1:1234
```

### 🎯 Toy routes

> Defined in `src/network/http/request/RequestRouter.ts`

| Path      | Response                                       |
|-----------|------------------------------------------------|
| `/echo`   | 🔁 Echoes the request body (chunked or fixed)  |
| `/sheep`  | 🐑 Streams 10 lines, 1s apart (chunked)        |
| _other_   | 👋 `Hello world!`                              |

---

## 🧪 Test

```bash
npm test                  # all tests
npm run test:unit         # pure modules
npm run test:integration  # real localhost sockets (TCP layer)
```

> 💡 Integration tests mock `tcp/common/constants` to lower timeouts/caps so backpressure and timeout paths run in milliseconds.

---

## 🚧 Status

**Under active development.** The TCP layer (listener, connection, buffered I/O with backpressure) is reasonably mature; the HTTP layer currently handles HTTP/1.1 request parsing, fixed-length and chunked bodies, and request/response framing.

### Known gaps

- ⚠️ `RequestRouter` and the TCP `serveClient` are toy demos marked `TODO`.
- ⚠️ `EOFBodyReader` does not yet read until connection close.
- ⚠️ No TLS, no keep-alive persistence, no compression, no static-file handler.

### 🗺️ Planned

- 📡 Support for additional HTTP versions
- 🔗 Persistent connections (keep-alive)
- 🧭 Richer routing layer
