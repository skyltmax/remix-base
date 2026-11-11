# Change Log

### Unreleased

Breaking release; see the [2.0.0 upgrade guide](docs/migrations/2.0.0.md).

- feat!: Replace `trustCloudFrontIPs` and its CloudFront IP fetching with a static `trustProxy` option, default
  `["loopback", "linklocal", "uniquelocal"]`. Production traffic reaches Node through Bunny CDN and an in-cluster Envoy
  (TCP peer in `10.244.0.0/16`, a single visitor entry in `X-Forwarded-For`), so the private-network list yields the
  visitor for `req.ip` and the Sentry user IP.
- feat!: `test/helpers` targets msw 3: `gqlOpHandler` takes msw 3's `HttpResponse<JsonBodyType>`, and `msw` `^3.0.4` is
  an optional peer dependency.
- chore(deps)!: Upgrade Sentry to 11; the `@sentry/react-router` and `@sentry/profiling-node` peer floors move from
  `^10.70.0` to `^11.11.0`. `init` absorbs the changes to its own options; apps migrate their own Sentry setup.
- chore(deps)!: Raise the `react-router` and `@react-router/express` peer floors from `^8.3.0` to `^8.5.1`.
- chore(deps)!: Raise the `express` peer floor from `^5.2.1` to `^5.3.0` for `proxy-addr` 2.0.8 (CVE-2026-90711) and the
  `qs` 6.16 CVE fixes.
- chore(deps)!: Upgrade `@growthbook/growthbook` from `^1.7.0` to `^2.0.0`. Targeting conditions are type-strict, so
  attributes sent with a type the rule does not use stop matching.
- feat: `createGrowthBook` `debug` option, which logs condition evaluation (including type mismatches) through the Pino
  logger. Fixes the `log` callback, which passed `logger.info` unbound and threw on the first debug log.
- chore!: Require Node `>=26.0.0` (was `>=22.22.0`).
- chore(deps): Upgrade `@signmax/config` to 4.0.0 and drop the stub `@types/set-cookie-parser`.
- build: Run CI and the release workflow on Node 26; pnpm does not enforce the root `engines`, so CI on Node 24 would
  have passed below the declared floor.

### [1.1.0] - 2026-11-09

- feat: `serveApp` `preMiddleware` option, mounted after the request logger and before compression, static files and
  cookie parsing, so a handler such as a reverse proxy can answer without the app's response processing.
- feat: `expressLogger` merges `res.locals.log` into the "request completed" line.
- feat: `init` `httpIntegration` option, merged into the default `Sentry.httpIntegration` options.

### [1.0.1] - 2026-10-03

- feat: Optional `skip` predicate on `deviceKeyMiddleware` plus an `isBotRequest` helper, so bot traffic no longer mints
  device keys or triggers `Set-Cookie`.
- fix: Stop attaching incoming request bodies to Sentry events.
- ref: Replace the deprecated `sendDefaultPii: true` with `dataCollection`.
- fix: Skip tracing for `/metrics` requests.

### [1.0.0] - 2026-08-21

- feat!: React Router 8.

### [0.0.6] - 2026-09-19

- feat: Optional `skip` predicate on `deviceKeyMiddleware` plus an `isBotRequest` helper, so bot traffic no longer mints
  device keys or triggers `Set-Cookie`. Backported from 1.0.0.

### [0.0.5] - 2026-08-13

- feat: GrowthBook sticky bucketing support (`stickyBucketService` option and `refreshStickyBuckets`). Breaking:
  `createScopedGrowthBook` is now async.
- build: Bump `@growthbook/growthbook` to `^1.6.5`.
- build: Upgrade `@signmax/config` to 2.0.0.
- build: Redo the Renovate setup on Renovate's own presets (`config:best-practices` + `config:js-lib`), rewrite
  `docs/upgrades/`, and enforce the supply-chain settle at resolution time in `pnpm-workspace.yaml`.
- build: Pin the pnpm version through `packageManager`; the CI workflows no longer pass a `version:` input.
- feat: React Router middleware mode contexts.
- ref: Rename graphql request function in server context.

### [0.0.4] - 2026-03-19

- feat: New Sentry React Router framework mode integration.
- feat: Sentry scope meta middleware.

### [0.0.3] - 2026-03-17

- build: Switch to official package registry.
- feat: Disable pino pretty logging in non-production.

### [0.0.2] - 2026-01-27

- fix: Move custom middlewares after asset handlers.

### [0.0.1] - 2025-11-05

- First public release.
