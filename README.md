# @signmax/remix-base

**Server and shared utilities for React Router 7 projects.**

This package provides a production-ready server setup and common utilities for React Router 7 (formerly Remix)
applications, including Express server configuration, middleware, logging, metrics, and AWS integration.

## Installation

```bash
npm install @signmax/remix-base
```

## Usage

### Basic Server Setup

The simplest setup with defaults:

```typescript
import { serveApp } from "@signmax/remix-base"
import type { ServerBuild } from "react-router"

const build = () => import("./build/server/index.js") as Promise<ServerBuild>

await serveApp(build)
```

### Complete Example with Custom Context

Here's a complete example showing how to set up the server with custom middleware, load context, and Sentry
instrumentation:

```typescript
import { serveApp } from "@signmax/remix-base"
import { getLoadContext, type LoadContext } from "@signmax/remix-base/load_context"
import { startMetrics } from "@signmax/remix-base/metrics"
import { deviceKeyMiddleware, requestMiddleware } from "@signmax/remix-base/middleware"
import { type AppLoadContext, type ServerBuild } from "react-router"

// Initialize Sentry if configured
if (process.env.SENTRY_DSN) {
  void import("@signmax/remix-base/instrumentation").then(({ init }) => init())
}

// Start Prometheus metrics server
await startMetrics()

// Development server setup
const viteDevServer =
  process.env.NODE_ENV === "development"
    ? await import("vite").then(vite =>
        vite.createServer({
          server: { middlewareMode: true },
        })
      )
    : null

const build: () => Promise<ServerBuild> = viteDevServer
  ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build") as Promise<ServerBuild>
  : async () => import("../build/server/index.js")

// Extend the base load context with your app-specific properties
declare module "react-router" {
  interface AppLoadContext extends LoadContext {
    // Add your custom properties here
    locale: string
    userId?: string
  }
}

await serveApp(
  build,
  viteDevServer?.middlewares,
  [requestMiddleware, deviceKeyMiddleware /* add your custom middleware */],
  (req, res) => {
    const baseContext = getLoadContext(req, res)

    const context: AppLoadContext = {
      ...baseContext,
      locale: req.cookies.locale || "en",
      userId: req.cookies.user_id,
    }

    // Optionally update GrowthBook attributes with user data
    if (context.growthbook) {
      context.growthbook.updateAttributes({
        userId: context.userId,
        locale: context.locale,
      })
    }

    return context
  }
)
```

This automatically includes:

- CloudFront IP trust proxy configuration (production only)
- Compression
- Cookie parsing
- Logging with Pino
- Sentry error tracking
- Security headers (Helmet, CSP)
- No-index middleware
- Static asset serving with proper cache headers

### Middleware

Import individual middleware as needed:

```typescript
import {
  cspMiddleware,
  deviceKeyMiddleware,
  endingSlashMiddleware,
  helmetMiddleware,
  noIndexMiddleware,
  sentryIPMiddleware,
} from "@signmax/remix-base/middleware"
```

### Utilities

```typescript
import { headers, timing } from "@signmax/remix-base/util"
```

Includes utilities for:

- Browser detection
- Request header handling
- Server timing metrics
- Revision tracking

### Logger

Access the pre-configured Pino logger:

```typescript
import logger from "@signmax/remix-base/logger"

logger.info("Application started")
logger.error({ err }, "Error occurred")
```

### Metrics

Prometheus metrics collection:

```typescript
import { metrics } from "@signmax/remix-base/metrics"
```

### API Client

GraphQL client utilities:

```typescript
import { createClient } from "@signmax/remix-base/client"
```

### Test Helpers

Testing utilities for your test suite:

```typescript
import { mockRequest, mockResponse } from "@signmax/remix-base/test/helpers"
```

### AWS Secrets Manager

Optional utility for loading secrets from AWS Secrets Manager:

```typescript
import { loadSecrets, type Secrets } from "@signmax/remix-base/secrets"

// Load secrets with defaults (uses AWS_SECRET_NAME or app/env/${APP_ENV})
const secrets = await loadSecrets()

// Or specify custom options
const secrets = await loadSecrets({
  secretName: "my-app/production",
  region: "us-east-1",
})

// Type the secrets by extending the Secrets interface
interface MySecrets extends Secrets {
  apiKey: string
  dbPassword: string
}

const secrets = await loadSecrets<MySecrets>()
// secrets.apiKey is typed as string
```

## Features

- **Production-ready Express server** with sensible defaults
- **CloudFront IP updater** for proper client IP tracking behind AWS CloudFront
- **Security middleware** including Helmet and CSP
- **Logging** with Pino (structured JSON logging)
- **Metrics** with Prometheus client
- **Sentry integration** for error tracking and profiling
- **AWS Secrets Manager** integration
- **GrowthBook** feature flag support
- **TypeScript** first-class support

## Environment Variables

The package respects common environment variables:

- `NODE_ENV` - Environment (production/development)
- `PORT` - Server port (default: 4000)
- `APP_ENV` - Application environment name (defaults to NODE_ENV)
- `API_HOST` - GraphQL API host (default: localhost)
- `API_PORT` - GraphQL API port (default: 3000)
- `API_PATH` - GraphQL API path (default: /graphql)
- `API_PASSTHROUGH_HEADERS` - Comma-separated list of additional headers to pass through to API (e.g.,
  "x-custom-header,x-another-header")
- `SHARED_SECRET` - Shared secret for API authentication
- `SHARED_SECRET_HEADER` - Header name for shared secret (default: x-shared-secret)
- `BUILD_DIR` - Client build directory (default: build/client)
- `ASSETS_DIR` - Assets directory (default: ${BUILD_DIR}/assets)
- `AWS_SECRET_NAME` - AWS Secrets Manager secret name (default: `app/env/${APP_ENV}`)
- `AWS_REGION` - AWS region (default: eu-central-1)
- `SENTRY_DSN` - Sentry error tracking

## Configuration

### Server Options

You can customize the server behavior using either the traditional parameters or an options object:

```typescript
import { serveApp, type ServeAppOptions } from "@signmax/remix-base"

// Using options object for fine-grained control
const options: ServeAppOptions = {
  build,
  devServer: viteDevServer?.middlewares,
  middleware: [requestMiddleware, deviceKeyMiddleware],
  getLoadContext: (req, res) => getLoadContext(req, res),
  port: 4000,
  buildDir: "dist/client",
  assetsDir: "dist/client/assets",
  enableCloudFrontIpUpdater: true,
  enableSentryIPMiddleware: true,
  enableEndingSlashMiddleware: true,
  enableHelmetMiddleware: true,
  enableNoIndexMiddleware: false, // Disable for sites that should be indexed
}

await serveApp(options)
```

### Sentry Configuration

Customize Sentry initialization:

```typescript
import { init, type SentryConfig } from "@signmax/remix-base/instrumentation"

const sentryConfig: SentryConfig = {
  denyUrls: [/\/health/, /\/metrics/],
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.05,
}

if (process.env.SENTRY_DSN) {
  init(sentryConfig)
}
```

### GrowthBook (Optional)

GrowthBook is an optional dependency for feature flagging. To use it:

1. Install the optional dependency:

```bash
npm install @growthbook/growthbook eventsource
```

2. Create a GrowthBook instance:

```typescript
import { createGrowthBook } from "@signmax/remix-base/growthbook"
import { getLoadContext } from "@signmax/remix-base/load_context"

const growthbook = await createGrowthBook({
  apiHost: "https://cdn.growthbook.io",
  clientKey: "your-client-key",
  timeout: 3000,
  streaming: true,
})

const customGetLoadContext = (req, res) => getLoadContext(req, res, { growthbook })

await serveApp(build, undefined, [], customGetLoadContext)
```

### Device Key Middleware

Customize the device key cookie name:

```typescript
import { createDeviceKeyMiddleware } from "@signmax/remix-base/middleware"

const deviceKey = createDeviceKeyMiddleware({
  cookieName: "my_device_id",
  maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
})

await serveApp(build, undefined, [deviceKey])
```

### Custom API Headers

Pass additional headers to your GraphQL API:

```bash
# Via environment variable
API_PASSTHROUGH_HEADERS="x-custom-auth,x-tenant-id"
```

Or configure via code by extending the default headers in your middleware.

## Publishing

This package is published to npm whenever a GitHub Release is created.

How to release:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit and push changes
4. Create a Git tag `vX.Y.Z` and a GitHub Release

## License

MIT
