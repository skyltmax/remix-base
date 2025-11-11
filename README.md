# @skyltmax/remix-base

**Production-ready server and shared utilities for React Router 7 apps.**

`@skyltmax/remix-base` bundles an opinionated Express 5 setup, middleware suite, instrumentation, and utilities so you
can ship React Router (Remix) projects without re-writing the same server glue.

## Quick Start

```bash
npm install @skyltmax/remix-base
```

```typescript
import { serveApp } from "@skyltmax/remix-base/server"
import type { ServerBuild } from "react-router"

const build = () => import("./build/server/index.js") as Promise<ServerBuild>

await serveApp(build, {})
```

## What You Get

- Express 5 server with sensible defaults and CloudFront-aware proxy trust
- Middleware bundle (Helmet, CSP, no-index, trailing slash guard, Sentry IP) plus optional device-key helper
- Structured logging via Pino and Prometheus metrics endpoint
- GraphQL helpers with cookie pass-through and shared-secret auth
- Load context utilities, GrowthBook integration, and AWS Secrets Manager helper
- TypeScript-first API with comprehensive tests

## Server Setup

Switch to the options object when you need control over middleware, dev servers, or context creation:

```typescript
import { serveApp, type ServeAppOptions } from "@skyltmax/remix-base/server"
import { getLoadContext } from "@skyltmax/remix-base/load_context"
import { deviceKeyMiddleware, requestMiddleware } from "@skyltmax/remix-base/middleware"

const build = async () => import("../build/server/index.js")

const options: ServeAppOptions = {
  middleware: [requestMiddleware(), deviceKeyMiddleware({ cookieName: "device_id" })],
  getLoadContext: (req, res) => getLoadContext(req, res, { deviceKeyCookieName: "device_id" }),
  trustCloudFrontIPs: true,
}

await serveApp(build, options)
```

In development, pass a Vite dev server (`devServer: viteServer.middlewares`) and call `startMetrics()` when you want a
Prometheus endpoint.

## Middleware & Utilities

```typescript
import {
  cspMiddleware,
  deviceKeyMiddleware,
  endingSlashMiddleware,
  helmetMiddleware,
  noIndexMiddleware,
  requestMiddleware,
  sentryIPMiddleware,
} from "@skyltmax/remix-base/middleware"

import {
  BrowserDetection,
  pipeHeaders,
  getConservativeCacheControl,
  makeTimings,
  time,
  getRevision,
} from "@skyltmax/remix-base/util"
```

- CSP middleware ships with nonce support; call `createCspMiddleware` for custom policies.
- `requestMiddleware` is a factory that accepts GraphQL client options and returns middleware that attaches a GraphQL
  request helper to `req.request`:

  ```typescript
  import { requestMiddleware } from "@skyltmax/remix-base/middleware"

  const customRequestMiddleware = requestMiddleware({
    endpoint: "https://api.example.com/graphql",
    sharedSecret: process.env.SHARED_SECRET,
    sharedSecretHeader: "x-api-key",
    passthroughHeaders: ["x-tenant-id"],
    skipCookies: false,
  })

  // Or use with default options
  const defaultRequestMiddleware = requestMiddleware()
  ```

- Utility exports cover HTTP headers, server timing, revision lookup, and user-agent parsing helpers.

## Logging & Metrics

```typescript
import logger from "@skyltmax/remix-base/logger"
import { startMetrics } from "@skyltmax/remix-base/metrics"

logger.info("Application started")

const metrics = await startMetrics({ port: 9394 })
```

`startMetrics` spins up a dedicated Express app exposing `/metrics` and returns a handle so you can stop the server
during shutdown.

## GraphQL Client

```typescript
import { createClient, createRequest, createResponseMiddleware } from "@skyltmax/remix-base/client"

const gqlClient = createClient({
  endpoint: "https://api.example.com/graphql",
  sharedSecret: process.env.SHARED_SECRET,
})

const requestFn = createRequest(req, res, createResponseMiddleware(req, res), {
  passthroughHeaders: ["x-tenant-id"],
})
```

Set `includeDefaultPassthroughHeaders` to `false` when you want complete control over forwarded headers.

## AWS Secrets Manager

```typescript
import { loadSecrets } from "@skyltmax/remix-base/secrets"

const secrets = await loadSecrets<{ apiKey: string }>("my-app/production", {
  region: "us-east-1",
})
```

The region falls back to `AWS_REGION` or `eu-central-1`.

## Optional Integrations

- **Sentry** – call `init` when `SENTRY_DSN` is set.

  ```typescript
  import { init } from "@skyltmax/remix-base/instrumentation"

  if (process.env.SENTRY_DSN) {
    init({
      dsn: process.env.SENTRY_DSN,
      configuration: {
        environment: "production",
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.05,
        sendDefaultPii: false,
      },
    })
  }
  ```

- **GrowthBook** – install `@growthbook/growthbook` + `eventsource` and pass the instance via `getLoadContext`.

  ```typescript
  import { createGrowthBook } from "@skyltmax/remix-base/growthbook"
  import { getLoadContext } from "@skyltmax/remix-base/load_context"

  const growthbook = await createGrowthBook({ apiHost: "https://cdn.growthbook.io", clientKey: "key" })

  const getContext = (req, res) => getLoadContext(req, res, { growthbook })
  ```

## Environment Variables

- `NODE_ENV` – sets development/production mode
- `PORT` – HTTP port (`4000` by default)
- `BUILD_DIR` – static asset root (`build/client` by default)
- `ASSETS_DIR` – fingerprinted assets directory (defaults to `${BUILD_DIR}/assets`)
- `PROMETHEUS_EXPORTER_PORT` – metrics server port (`9394` by default)
- `AWS_REGION` – Secrets Manager region (`eu-central-1` by default)
- `GIT_REV` – optional release/commit override for logging and Sentry

## Testing Helpers

```typescript
import { gqlOpHandler } from "@skyltmax/remix-base/test/helpers"
```

MSW helpers simplify GraphQL mocking and reuse the package defaults.

## Publishing

Releases are driven by GitHub Releases:

1. Update the version in `package.json` and refresh `CHANGELOG.md`.
2. Commit, push, and tag (`vX.Y.Z`).
3. Create a GitHub Release; CI publishes to npm.

## License

MIT
