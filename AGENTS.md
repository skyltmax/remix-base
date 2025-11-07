# AI Agent Guide for @signmax/remix-base

This document provides comprehensive guidance for AI coding agents working with the `@signmax/remix-base` package.

## Table of Contents

1. [Conventions](#conventions)
2. [Package Overview](#package-overview)
3. [Getting Started](#getting-started)
4. [Development](#development)
5. [Testing](#testing)
6. [Configuration](#configuration)

---

## Conventions

- Max line length before wrapping is 120 chars.
- Don't be overly verbose, prefer brevity.
- Always put strong emphasis on idiomatic TypeScript solutions.
- Always uphold the configured linter settings - eslint, prettier.
- Avoid tautologic comments - prefer saying nothing over stating the obvious.
- Linear git history is required. Avoid cherry-picking etc.

### Commit message

Commit messages should follow a specific format:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

For example:

```
fix(middleware): Fix device key cookie initialization

The device key middleware was not setting the cookie header correctly.

Fixes #42
```

Or:

```
feat(server): Add configurable middleware options

Allow users to disable default middleware via ServeAppOptions.

Breaking change: Default middleware is now optional
```

---

## Package Overview

### Structure

This is a **standalone npm package** providing server utilities for React Router 7 applications:

```
@signmax/remix-base/
├── src/
│   ├── index.ts                    # Package exports
│   ├── server.ts                   # Main serveApp function
│   ├── instrumentation.ts          # Sentry initialization
│   ├── load_context.ts             # Load context factory
│   ├── logger.ts                   # Pino logger setup
│   ├── metrics.ts                  # Prometheus metrics
│   ├── secrets.ts                  # AWS Secrets Manager
│   ├── growthbook.ts               # GrowthBook factory (optional)
│   ├── api/
│   │   ├── client.ts               # GraphQL client utilities
│   │   ├── persisted.ts            # Persisted query support
│   │   └── client.test.ts
│   ├── middleware/
│   │   ├── csp.ts                  # Content Security Policy
│   │   ├── device_key.ts           # Device tracking cookie
│   │   ├── ending_slash.ts         # URL normalization
│   │   ├── helmet.ts               # Security headers
│   │   ├── noindex.ts              # SEO robots control
│   │   ├── request.ts              # GraphQL request setup
│   │   └── sentry_ip.ts            # Sentry IP tracking
│   ├── cloudfront-ips/
│   │   └── updater.ts              # CloudFront IP trust proxy
│   ├── util/
│   │   ├── browser_detection.ts
│   │   ├── headers.server.ts
│   │   ├── revision.ts
│   │   └── timing.server.ts
│   └── test/
│       └── helpers.ts              # MSW test utilities
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Technology Stack

**Core:**

- TypeScript
- React Router 7
- Express 5
- Node.js

**Dependencies:**

- **Server:** Express, compression, cookie-parser, close-with-grace
- **Logging:** Pino, pino-http, pino-pretty
- **Monitoring:** Sentry, Prometheus (prom-client)
- **API:** GraphQL Request, set-cookie-parser
- **Optional:** GrowthBook (feature flags), AWS SDK (secrets)

**Testing:**

- Vitest
- MSW (Mock Service Worker)

---

## Getting Started

### Installation

```bash
npm install @signmax/remix-base
```

### Basic Usage

```typescript
import { serveApp } from "@signmax/remix-base/server"
import type { ServerBuild } from "react-router"

const build = () => import("./build/server/index.js") as Promise<ServerBuild>

await serveApp({ build })
```

### Development Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

---

## Development

---

## Development

### TypeScript Conventions

**Imports:**

- Use absolute imports from package root
- Prefer named exports over default exports

**Code Style:**

- Follow ESLint configuration from `@signmax/config`
- Use Prettier for formatting
- Prefer `const` over `let`, avoid `var`
- Use explicit return types for public APIs

**Patterns:**

- Use factory functions for configurable instances (e.g., `createGrowthBook`, `deviceKeyMiddleware`)
- Provide both programmatic and environment-based configuration
- Maintain backward compatibility when adding new options

### Key Modules

#### Server (`src/server.ts`)

The main `serveApp` function sets up an Express server with:

- CloudFront IP trust proxy (configurable)
- Logging, compression, cookie parsing
- Configurable middleware stack
- Static asset serving
- Health check endpoint (`/livez`)

**Usage:**

```typescript
import { serveApp } from "@signmax/remix-base/server"

await serveApp({
  build,
  trustCloudFrontIPs: true, // default
  middleware: customMiddleware,
  getLoadContext,
  port: 4000,
})
```

#### Load Context (`src/load_context.ts`)

Factory for creating React Router load context:

- Request logging
- GrowthBook instance (optional)
- Client IP tracking
- CSP nonce
- Revision info

**Usage:**

```typescript
import { getLoadContext } from "@signmax/remix-base/load_context"

const context = getLoadContext(req, res, {
  growthbook: gbInstance,
  deviceKeyCookieName: "my_device_key",
})
```

#### API Client (`src/api/client.ts`)

GraphQL client utilities with:

- Cookie forwarding from API responses
- Request/response logging
- Error handling with Sentry
- Configurable endpoint, shared secret, and passthrough headers via `GraphQLClientOptions`
- Shared secret authentication

**Key functions:**

- `createClient(uri?, headers?, responseMiddleware?)` - Create GraphQL client
- `createRequest(req, res, responseMiddleware?, options?)` - Express request setup
- `createSimpleRequest(request, responseMiddleware?, options?)` - Fetch API request setup
- `createResponseMiddleware(req, res, skipCookies?)` - Response handler

`GraphQLClientOptions` allows configuring:

- `endpoint` - target GraphQL endpoint (default: `http://localhost:3000/graphql`)
- `sharedSecret` / `sharedSecretHeader` - authentication pair (header omitted when secret falsy)
- `passthroughHeaders` - additional headers forwarded alongside `DEFAULT_PASSTHROUGH_HEADERS`
- `includeDefaultPassthroughHeaders` - disable defaults by setting to `false`

`DEFAULT_PASSTHROUGH_HEADERS` is exported for convenience when composing custom configurations.

#### Middleware

All middleware exports a factory function or configured instance:

**CSP** (`src/middleware/csp.ts`):

- Content Security Policy headers
- Nonce-based script execution

**Device Key** (`src/middleware/device_key.ts`):

- Anonymous user tracking via cookie
- Configurable cookie name and max age

```typescript
deviceKeyMiddleware({ cookieName: "device_id", maxAge: 31536000000 })
```

**Ending Slash** (`src/middleware/ending_slash.ts`):

- Redirects URLs ending with `/` (except root)
- SEO optimization

**Helmet** (`src/middleware/helmet.ts`):

- Security headers via @nichtsam/helmet

**No-Index** (`src/middleware/noindex.ts`):

- Adds `X-Robots-Tag: noindex, nofollow`

**Request** (`src/middleware/request.ts`):

- Attaches GraphQL request function to `req.request`
- Factory function `requestMiddleware(options?)` accepts configuration
- Options: `endpoint`, `sharedSecret`, `sharedSecretHeader`, `passthroughHeaders`, `includeDefaultPassthroughHeaders`,
  `skipCookies`

```typescript
const middleware = requestMiddleware({
  endpoint: "https://api.example.com/graphql",
  sharedSecret: "secret123",
  skipCookies: false,
})

// Or use with defaults
const defaultMiddleware = requestMiddleware()
```

````

**Sentry IP** (`src/middleware/sentry_ip.ts`):

- Sets client IP in Sentry context

#### Instrumentation (`src/instrumentation.ts`)

Sentry initialization with configurable options:

```typescript
import { init, type SentryConfig } from "@signmax/remix-base/instrumentation"

init({
  dsn: process.env.SENTRY_DSN!,
  configuration: {
    environment: "production",
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.05,
  },
})
````

#### Metrics (`src/metrics.ts`)

Prometheus metrics server:

```typescript
import { startMetrics } from "@signmax/remix-base/metrics"

await startMetrics(9394) // port
```

#### Secrets (`src/secrets.ts`)

AWS Secrets Manager utility - optional for users:

- Provides `loadSecrets()` function
- Users call it explicitly if needed
- Requires explicit `secretName`
- Optional region override (defaults to `AWS_REGION` or `eu-central-1`)
- Type-safe with generics

**Usage:**

```typescript
import { loadSecrets } from "@signmax/remix-base/secrets"

const secrets = await loadSecrets<{ apiKey: string }>("my-app/secrets", {
  region: "us-east-1",
})
```

#### GrowthBook (`src/growthbook.ts`)

**Optional dependency** - feature flag support:

```typescript
import { createGrowthBook, type GrowthBookConfig } from "@signmax/remix-base/growthbook"

const gb = await createGrowthBook({
  apiHost: "https://cdn.growthbook.io",
  clientKey: "key",
  timeout: 3000,
  streaming: true,
})
```

---

## Testing

---

## Testing

### Test Framework

**Vitest** is used for all testing with MSW for API mocking.

**Run tests:**

```bash
pnpm test           # Run all tests
pnpm test --watch   # Watch mode
pnpm test --coverage # With coverage
```

### Test Structure

**Location:** Tests are colocated with source files using `.test.ts` suffix

- `src/api/client.test.ts`
- `src/middleware/device_key.test.ts`
- `src/util/headers.server.test.ts`

### Testing Patterns

**Unit Tests** - Majority of tests

```typescript
import { describe, it, expect } from "vitest"

describe("MyFunction", () => {
  it("should do something", () => {
    expect(myFunction()).toBe(expected)
  })
})
```

**Middleware Tests**

```typescript
import { createRequest, createResponse } from "node-mocks-http"

const request = createRequest({
  method: "GET",
  url: "/test",
  cookies: { session: "abc123" },
})

const response = createResponse()

middleware(request, response, next)

expect(response.cookies.device_key).toBeDefined()
```

**API Client Tests with MSW**

```typescript
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const server = setupServer(
  http.post(`http://${API_HOST}:${API_PORT}${API_PATH}`, () => {
    return HttpResponse.json({ data: { result: "success" } })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Test Helpers

**MSW Test Utilities** (`src/test/helpers.ts`):

```typescript
import { gqlOpHandler } from "@signmax/remix-base/test/helpers"

const handler = gqlOpHandler("MyOperation", HttpResponse.json({ data: { myField: "value" } }), {
  endpoint: "http://localhost:3000/graphql",
})
```

Omit `endpoint` to rely on the library default.

### Best Practices

- **Prefer unit tests** - Fast, isolated, focused
- **Mock external dependencies** - Use MSW for HTTP, stub functions for services
- **Test public APIs** - Focus on exported functions and types
- **Avoid implementation details** - Test behavior, not internals
- **Keep tests simple** - One assertion per test when possible
- **Use descriptive names** - `it("should redirect URLs with trailing slash")`

---

## Configuration

### Environment Variables

Some of the configuration is environment-based with sensible defaults:

**Common overrides:**

- `PORT` - Server port (default: 4000)
- `BUILD_DIR` - Build directory (default: build/client)
- `ASSETS_DIR` - Assets directory (default: ${BUILD_DIR}/assets)

**AWS Secrets Manager:**

- `AWS_REGION` - AWS region (default: eu-central-1)

**Prometheus:**

- `PROMETHEUS_EXPORTER_PORT` - Metrics port (default: 9394)

### Configurable Options

**Server Options:**

```typescript
interface ServeAppOptions {
  build: () => Promise<ServerBuild>
  devServer?: RequestHandler
  middleware?: RequestHandler[]
  getLoadContext?: GetLoadContextFunction
  port?: string | number
  buildDir?: string
  assetsDir?: string
  trustCloudFrontIPs?: boolean
}
```

**Sentry Config:**

```typescript
type SentryNodeOptions = import("@sentry/node").NodeOptions

interface SentryConfig {
  dsn: string
  configuration?: SentryNodeOptions
}
```

**GrowthBook Config:**

```typescript
interface GrowthBookConfig {
  apiHost: string
  clientKey: string
  timeout?: number
  streaming?: boolean
}
```

**Load Context Options:**

```typescript
interface GetLoadContextOptions {
  growthbook?: GrowthBookClient
  deviceKeyCookieName?: string
}
```

**Device Key Middleware:**

```typescript
interface DeviceKeyMiddlewareOptions {
  cookieName?: string
  maxAge?: number
}
```

**Request Middleware:**

```typescript
interface RequestMiddlewareOptions extends GraphQLClientOptions {
  skipCookies?: boolean
}

interface GraphQLClientOptions {
  endpoint?: string
  sharedSecret?: string
  sharedSecretHeader?: string
  passthroughHeaders?: string[]
  includeDefaultPassthroughHeaders?: boolean
}
```

### Adding New Configuration

When adding new configuration options:

1. **Document in README.md** under Environment Variables
2. **Add to interface** if it's an option object
3. **Maintain backward compatibility** - use optional properties with defaults
4. **Update AGENTS.md** with usage examples

### Backward Compatibility

When making changes:

- ✅ Add new optional parameters
- ✅ Provide sensible defaults
- ✅ Support both old and new calling patterns (function overloads)
- ❌ Don't remove or rename existing exports
- ❌ Don't change default behavior without major version bump

**Example:**

```typescript
// Old way still works
serveApp(build, devServer, middleware, getLoadContext, port)

// New way also works
serveApp({ build, devServer, middleware, getLoadContext, port })
```
