# Upgrade interactions

The landmines a version bump in this repo can step on. The `upgrade-research` workflow
(`.claude/workflows/upgrade-research.js`) greps this file for every Renovate PR it briefs; keep entries numbered and
factual. When an upgrade goes sideways for a reason not listed here, add the entry.

## 1. The devcontainer image is built in skyltmax/infra; Renovate bumps the pin here

`.devcontainer/docker-compose.yml` points at `harbor.signmax.cloud/public/devcontainer` with `rails-<upstream>-<N>`
rebuild-suffix tags, built and versioned in skyltmax/infra. Renovate tracks the pin (regex versioning for the `-N`
suffix), but two things stay manual on every image PR: the `CHANGELOG_DISPLAYED_<N>` marker in `.devcontainer/boot.sh`
must be bumped by hand, and the version choice itself originates in infra — if the image looks stale, the fix is an
infra build, not a pin edit here.

## 2. peerDependencies are the consumer contract

`react-router`, `@react-router/express`, `express`, `@sentry/react-router`, `@sentry/profiling-node` are
peerDependencies: their ranges define what every consumer (the monorepo BFFs) must satisfy. Ranges widen on majors
rather than bump (Renovate default for peerDeps); a PR that raises a peer range's floor forces every consumer to upgrade
in lockstep and is a breaking change for this package — treat it as a deliberate, coordinated move with the monorepo
catalogs, never a routine merge. `react-router` and `@react-router/express` ship on the same release train and must move
together (grouped in `renovate.json5`).

## 3. GrowthBook sticky-bucket code relies on per-version-verified SDK internals

`src/growthbook.ts` depends on `@growthbook/growthbook` behaviour that is not part of the documented API surface:
`applyStickyBuckets` returning `{ stickyBucketAssignmentDocs, saveStickyBucketAssignmentDoc }`, `getUserContext()`
returning the live mutable context reference, and evaluation gating sticky bucketing on `saveStickyBucketAssignmentDoc`
being present (all verified against 1.6.4/1.6.5 sources). On ANY `@growthbook/growthbook` bump: re-verify those three
facts in the new version's `dist/esm/core.mjs` / `GrowthBookClient.mjs`, and rely on `src/growthbook.test.ts` — it
exercises exactly these seams. `eventsource` is the polyfill wired via `setPolyfills` at module import for GrowthBook
streaming; it is grouped with the SDK.

## 4. pnpm build-script allowlist

`pnpm-workspace.yaml` carries `onlyBuiltDependencies` — the explicit allowlist of packages whose postinstall scripts may
run. pnpm 11 fails `pnpm install` (exit 1) when a dependency wants to run a script that is not listed. A bump that
introduces or renames a build-script dependency needs the allowlist updated in the same PR, or CI and local installs
break.

## 5. Merging ≠ releasing

This is a published library. A merged Renovate PR sits on `main` until a GitHub Release is cut (`release.yml`: stable
releases publish from the tag matching `package.json`; prerelease tags `v<base>-<pre>.<n>` publish under the `canary`
dist-tag with `package.json` holding the plain base version). Consumers then bump their pnpm catalog entry.
Consequences: merged-but-unreleased changes accumulate silently — keep `CHANGELOG.md` → `### Unreleased` current as PRs
merge, and validate runtime-affecting batches with a canary in the monorepo before the stable release.

## 6. @signmax/config carries the shared TypeScript/ESLint/Prettier config

A `@signmax/config` bump can change compiler strictness, lint rules, or formatting for the whole repo at once. Run
`pnpm validate` on the PR and expect possible formatting churn; a new lint error surfaced by the bump belongs in the
same PR only if trivial, otherwise hold and fix separately first.

## 7. Node rides CI inline pins, not a manager

`ci.yml` and `release.yml` pin `node-version: "24"` inline; Renovate's github-actions manager bumps action versions
(`actions/setup-node@v4`), not the Node version itself. Bumping Node is a manual, deliberate change — coordinate with
the devcontainer image (interaction 1) and the monorepo's Node version so the library is tested on what consumers run.
