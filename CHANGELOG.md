# Change Log

### Unreleased

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
