# Upgrade interactions

The landmines a version bump in this repo can step on. The impact brief ([`RUNBOOK.md`](RUNBOOK.md)) checks every
Renovate PR against this file; when an upgrade goes sideways for a reason not listed here, add the entry.

## 1. peerDependencies are the consumer contract

`react-router`, `@react-router/express`, `express`, `@sentry/react-router` and `@sentry/profiling-node` are
`peerDependencies`: their ranges define what every consumer (the monorepo BFFs) must satisfy. Renovate widens peer
ranges instead of bumping them, so an in-range minor raises no PR — it arrives only through `lockFileMaintenance` — and
a major surfaces as a widen (`^7.13.0` → `^7.13.0 || ^8.0.0`).

**Raising a floor or narrowing a range is a breaking change of this package**, never routine maintenance: it forces
every consumer to upgrade in lockstep with a catalog bump. `react-router` and `@react-router/express` ride the same
release train and Renovate's `group:monorepos` preset already puts them on one branch — verified: a `react-router` 8
lookup produces a single `renovate/major-react-router-monorepo` branch. `@sentry/react-router` +
`@sentry/profiling-node` share the `sentry-javascript` monorepo entry and should group the same way — unverified here,
since both sit in range and raise no PR yet.

Second-order effect: pnpm's `autoInstallPeers` is on, so the peers are resolved into `pnpm-lock.yaml` from those very
ranges. Whatever CI typechecks and tests against is the newest in-range peer, not a version we declare anywhere — a
widen changes what our own build resolves, not just what consumers may install.

## 2. The devcontainer image is built in skyltmax/infra; Renovate bumps the pin here

`.devcontainer/docker-compose.yml` points at `harbor.signmax.cloud/public/devcontainer`, built in skyltmax/infra. The
tag is a bare build counter (`:35`) — the `rails-<upstream>` stack prefix was dropped at image 32 — so `renovate.json5`
gives it regex versioning that maps the counter to `patch`, and `docker:pinDigests` adds the `@sha256:…` on top. Two
things stay manual on an image PR:

- bump `CHANGELOG_DISPLAYED_<N>` in `.devcontainer/boot.sh`, or the new image's changelog never prints;
- if the image changes the Node or pnpm it ships, bump `PNPM_ALREADY_RESET_<N>` too — that marker is what forces
  `rm -rf node_modules` + a fresh `pnpm install` on next boot, and modules built against the old runtime otherwise
  survive in the workspace bind. `.devcontainer/.bootdone` is gitignored, so it is the committed marker names in
  `boot.sh` that decide whether a reset runs, not any local state.

The version choice originates in infra: a stale image is fixed by an infra build, not a pin edit here. Anonymous tag
listing against harbor is rejected, so a local dry-run always logs
`Failed to look up docker package harbor.signmax.cloud/public/devcontainer: no-result` — expected locally, and no
statement about the rule.

## 3. GrowthBook sticky bucketing rides per-version-verified SDK internals

`src/growthbook.ts` depends on `@growthbook/growthbook` behaviour that is not part of the documented API surface:
`applyStickyBuckets` returning `{ stickyBucketAssignmentDocs, saveStickyBucketAssignmentDoc }`, `getUserContext()`
returning the live mutable context reference, and evaluation gating sticky bucketing on the presence of
`saveStickyBucketAssignmentDoc` on the user context (verified again against 1.6.5's `dist/esm/core.mjs`).
`createScopedInstance` and `setForcedFeatures` are the other seams.

On ANY `@growthbook/growthbook` bump: re-verify those facts in the new version's `dist/esm/core.mjs` /
`GrowthBookClient.mjs` and lean on `src/growthbook.test.ts`, which exercises exactly these seams. `eventsource` is the
polyfill wired through `setPolyfills` at module import for streaming — it is a separate PR (there is no group), so brief
the two together whenever both are open. Both are `optionalDependencies`: a break here degrades the GrowthBook feature
for consumers that opt in, it does not break the server.

## 4. Sentry is used through v10-era APIs on both sides of the request

`src/instrumentation.ts` configures `profileSessionSampleRate` + `profileLifecycle` and composes
`Sentry.httpIntegration()`, `nodeProfilingIntegration()` and `Sentry.pinoIntegration()`;
`src/middleware/sentry_scope.ts` uses `getIsolationScope().setAttributes()/setTags()`; `src/router_context.ts` calls
`Sentry.setUser`. A `@sentry/*` major typically renames or reshapes exactly these (integration factories, the profiling
options, scope accessors), and `@sentry/react-router` additionally has to keep matching the React Router major in §1 —
its framework-mode integration is what the peer pair is for.

`@sentry/profiling-node` ships a native profiler (`@sentry-internal/node-cpu-profiler`) that must stay in the
`allowBuilds` list (§8), and `@sentry/cli` runs a postinstall for the same reason.

## 5. @signmax/config owns lint, format and the TypeScript config — and its peer range is wider than what it tests

`@signmax/config` 2.0 keeps the whole ESLint/Prettier plugin roster in its own `dependencies`; this repo declares only
the three CLIs it lists as peers: `eslint ^9.30.0 || ^10.0.0`, `prettier ^3.6.0`, `typescript >=5.9 <6.1`. A config bump
therefore changes lint rules and formatting for the whole repo at once — run `pnpm validate`, and expect the
`format-check` CI job to fail until the reformat is committed on the PR.

The 2.0 upgrade is the cautionary tale for CLI bumps, and all three cases were "in range, still wrong":

- `prettier` 3.6.2 satisfied `^3.6.0` but the `prettier-plugin-tailwindcss` 0.8.1 the config pins crashed on it
  (`TypeError: a.startsWith is not a function`); the fix was moving to the 3.9.6 the config repo tests against.
- `eslint` 9.39.1 satisfied `^9.30.0` but the config's own `@eslint/js` 10 pin declares `eslint ^10`, so pnpm reported
  an unmet peer; we moved to eslint 10. `eslint-plugin-react` and `eslint-plugin-jsx-a11y` still declare peers that stop
  at eslint 9 — upstream calls that stale metadata, pnpm warns, nothing fails, and neither plugin has files to lint here
  (no JSX in `src/`).
- a newer `@vitest/eslint-plugin` enabled `vitest/no-conditional-expect`, which failed the build on three existing
  `try/catch` assertions in `src/api/client.test.ts`.

So: treat the config's peer ranges as necessary, not sufficient — the version the config repo pins for itself is the one
it actually verifies. Note also that `typescript >=5.9 <6.1` caps us: Renovate will happily offer a `typescript` 7 PR
(it reads our devDependency, not the config's peer), and merging it would break the config's peer contract. A TypeScript
major waits for a `@signmax/config` release that widens the cap.

## 6. Merging ≠ releasing

A merged PR only changes `main`. This is a published library: `release.yml` publishes `@signmax/remix-base` to npm when
a GitHub Release is cut (stable releases verify the tag equals `package.json`'s version; prerelease tags
`v<base>-<pre>.<n>` publish under the `canary` dist-tag with `package.json` still holding the base version), and
consumers only see it after they bump their pnpm catalog entry. Renovate never touches the version, so:

- keep `CHANGELOG.md` → `### Unreleased` current as PRs merge — it is hand-maintained, which is also why dependency
  commits are `chore(deps):`, leaving `feat:`/`fix:`/`build:` to mean a change we wrote;
- a bump that changes runtime behaviour for consumers is a release note, not silent maintenance;
- validate risky batches with a prerelease and try the canary in the monorepo before releasing stable.

## 7. Renovate's settle time does not govern lockfile maintenance — pnpm's does

`config:best-practices` brings `security:minimumReleaseAgeNpm`, a 3-day settle on npm updates, but that only filters the
candidates **Renovate itself** proposes: it explicitly sets `minimumReleaseAge: null` for `lockFileMaintenance`, `pin`,
`replacement`, `bump` and `rollback` updates, because the package manager performs those resolutions. So the weekly
lockfile PR can pull a transitive published hours ago. The policy is therefore enforced where resolution happens, in
`pnpm-workspace.yaml`:

- `minimumReleaseAge: 4320` (3 days, matching the Renovate side) — any pnpm ≥11 resolving this workspace, including
  Renovate's worker, refuses younger versions. Setting it explicitly also turns on `minimumReleaseAgeStrict`, so an
  immature pick fails the install instead of being auto-excluded;
- `minimumReleaseAgeExclude: ['@signmax/*', '@skyltmax/*']` — first-party releases exist to be validated here the day
  they ship (`renovate.json5` carries the matching exemption);
- `trustLockfile: true` skips re-verification of committed entries on install, because entries resolved before this
  policy can be younger than the cutoff. Caveat worth knowing in a public repo: it also means a lockfile authored in a
  fork PR is installed by CI without that re-check;
- `packageManager: "pnpm@11.22.0"` in `package.json` pins the resolver so CI, the devcontainer and Renovate's worker all
  apply the same policy. `pnpm/action-setup` reads that field — the workflows deliberately pass no `version:` input, and
  the action errors when both are given and disagree. Renovate tracks the field as an ordinary npm dep (verified: it
  produces a `renovate/pnpm-11.x` branch).

Consequence: a release younger than 3 days is invisible to the whole pipeline. For a deliberate early adoption, add a
temporary `minimumReleaseAgeExclude` entry rather than lowering the global cutoff.

## 8. pnpm build-script allowlist

`pnpm-workspace.yaml` carries `allowBuilds` — the allowlist of packages whose install scripts may run; pnpm fails the
install otherwise. Current entries: `@sentry-internal/node-cpu-profiler`, `@sentry/cli`, `esbuild`, `msw`,
`unrs-resolver`. A bump that introduces or renames a build-script dependency must update the allowlist in the same PR.

Two traps: `unrs-resolver` arrives transitively through `@signmax/config`'s `eslint-plugin-import-x`, so it is not
visible in our `package.json` at all; and pnpm 11 **removed** `onlyBuiltDependencies` (plus `onlyBuiltDependenciesFile`,
`neverBuiltDependencies`, `ignoredBuiltDependencies`) — a leftover block of that name is silently inert, not a second
allowlist.

## 9. CI toolchain versions in `with:` blocks are tracked

The github-actions manager extracts `with:` values as depType `uses-with`, so `node-version: "24"` is a tracked
dependency (verified: `depName: node`, `packageName: actions/node-versions`, `versioning: node`) and raises ordinary
bump PRs — it is not, as previously assumed here, invisible to Renovate. `pnpm` is not among them; it comes from
`packageManager` (§7).

Both mirror something owned elsewhere, so the brief's question is "does this match what the devcontainer image ships?"
(§2) — the image is the local toolchain, and this repo declares no `engines`, so nothing else pins a Node floor for
consumers. Check the first such PR for precision drift as well: the value is written as a bare major, and a proposal
that rewrites it to `24.19.0` would pin CI to one patch instead of floating with the image (disable patch updates for it
if that happens, the way skyltmax/config does for `ruby-version`).

Related: `workarounds:all` gives `@types/node` `node` versioning, which keeps it tracking Node release lines rather than
plain SemVer — it currently sits a major ahead of the CI Node, which is fine for types but worth a look on any bump.

## 10. Test tooling that must move together

- `@vitest/coverage-v8` declares an **exact** `vitest` peer (`4.0.18` for 4.0.18). Renovate's `vitest` monorepo group
  keeps them on one branch (verified), but a floating `vitest` range plus an exact `@vitest/coverage-v8` lets
  `lockFileMaintenance` drift them apart — which is why the `:pinOnlyDevDependencies` pin PR matters (RUNBOOK).
- `vitest` 4 carries `vite` as a **dependency** with `^6 || ^7`, while we also declare our own `vite` devDependency for
  `vitest.config.ts` + `vite-tsconfig-paths`. A `vite` major (8) can therefore be merged while vitest still resolves its
  own vite 7 — two Vite majors in one install. Wait for vitest to widen its range.

## 11. msw is a devDependency that ships in a published export path

`package.json` exposes `./test/helpers`, and `src/test/helpers.ts` imports `msw` — yet `msw` is only a devDependency.
Consumers importing that path resolve `msw` from their own tree, so an msw major changes a **published** contract even
though nothing in our dependency blocks says so. Check `src/test/helpers.ts` against the new msw API on every msw major,
and treat it as consumer-visible in the CHANGELOG (§6).

## 12. pino-http is loaded through a CJS/ESM interop shim

`src/logger.ts` does `"default" in pinohttpImport ? pinohttpImport.default : pinohttpImport` (with an
`@typescript-eslint/no-explicit-any` disable on it) because pino-http's ESM export shape is ambiguous. If a bump changes
that shape, the shim silently yields a non-function and every request-logging call fails at runtime — typecheck won't
catch it, since the shim is typed `any`. `pino` itself is used through `stdTimeFunctions.isoTime`, `formatters.level`
and the `Logger` type re-exported in `src/router_context.ts`.

## 13. Express 5 syntax is baked into the server

`src/server.ts` mounts the React Router handler on `app.all("*splat", …)` — Express 5 named-wildcard syntax that is
invalid in Express 4 and could move again in Express 6. Also Express-5-specific: `res.appendHeader` in
`src/api/client.ts`, `req.hostname` throwing on a malformed Host header (wrapped in try/catch in
`src/middleware/sentry_scope.ts`), and the `trust proxy` array assembled in `src/cloudfront-ips/updater.ts`. An
`express` major is a peer-range change (§1) **and** a code change here.

## 14. The CloudFront IP snapshots are tracked by nothing

`src/cloudfront-ips/{backup,vpc}.json` are hand-maintained snapshots copied into `dist/` by the build script (they are
data, not dependencies — no manager sees them). `backup.json` is only the bootstrap list until the first live fetch from
`ip-ranges.amazonaws.com` succeeds, so staleness degrades the trust-proxy list for the first moments of a process rather
than breaking it. Refresh it deliberately; no Renovate PR will ever remind you.
