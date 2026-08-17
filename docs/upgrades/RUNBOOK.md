# Upgrade runbook

How we keep every dependency in this repo current. Two layers:

- **Layer 1 — Renovate (mechanical):** detects pins, opens bump PRs, refreshes the lockfile, dumps changelogs. Config:
  [`renovate.json5`](../../renovate.json5). Preset-first — the only custom rules are the first-party settle exemption
  and the harbor devcontainer's build-counter versioning. Zero awareness of our usage.
- **Layer 2 — the impact brief:** per-PR research grounded in this repo + [`INTERACTIONS.md`](INTERACTIONS.md). This is
  what decides what merges. Either run the `upgrade-research` workflow
  ([`.claude/workflows/upgrade-research.js`](../../.claude/workflows/upgrade-research.js)) or have a Claude session read
  the PR diff + release notes against `INTERACTIONS.md`, dependency by dependency.

**Merging is NOT shipping.** A merged PR only changes `main`. This is a published library: consumers get the change when
a GitHub Release publishes `@signmax/remix-base` to npm and the monorepo bumps its catalog entry (INTERACTIONS §6). The
brief gates `main`; the release is the consumer-facing gate.

Scope:

| manager        | files                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------- |
| npm            | `package.json` (all five dependency blocks + `packageManager`) and `pnpm-lock.yaml`      |
| github-actions | `.github/workflows/{ci,release}.yml` — actions **and** the `node-version:` `with:` value |
| docker-compose | the harbor devcontainer image pin in `.devcontainer/docker-compose.yml`                  |

No `# renovate:` annotations are needed anywhere. Everything resolves from public registries except the harbor image,
whose tag listing rejects anonymous requests — that lookup depends on a server-side host rule, so it fails silently in a
local dry-run.

---

## Config changes

Renovate runs self-hosted (Mend Renovate CE) and reads config from the **default branch only**, so `renovate.json5`
takes effect once it is on `main` (config on `main` also means no onboarding PR). Two things live outside this repo and
are prerequisites for anything being opened at all: the CE discovery filter and the dedicated Renovate GitHub App
installation, both managed in skyltmax/infra — filter and installation are each necessary, neither is sufficient. The
harbor pull credentials used for the devcontainer image lookup are a host rule on that same server.

Validate after every edit — no argument, so it validates as _repo_ config:

```
npx --yes --package renovate renovate-config-validator
```

The green floor before a human merges anything is `ci.yml`'s four jobs: `lint`, `typecheck`, `test`, `format-check`.
`format-check` matters more than it looks: a `@signmax/config` or `prettier` bump that changes formatting fails CI until
the reformat is committed on the PR (INTERACTIONS §5).

Expected one-time first-run PRs from this config — the branch names below are what a `--dry-run=lookup` produced against
this tree, minus the github-actions and harbor lookups a local run cannot perform:

- **`renovate/pin-dependencies`** — `:pinOnlyDevDependencies` pins every ranged devDependency to exact (`@types/*`,
  `msw`, `node-mocks-http`, `npm-run-all`, `vite`, `vite-tsconfig-paths`, `vitest`). Merge this one early: it is what
  stops `vitest` floating away from the exactly-pinned `@vitest/coverage-v8` (INTERACTIONS §10).
- **Digest pins** — SHA pins for every action in both workflows (`helpers:pinGitHubActionDigests`) and a `@sha256:…` on
  the harbor devcontainer image (`docker:pinDigests`).
- **`renovate/npm-run-all-replacement`** — `npm-run-all` → `npm-run-all2`, a replacement, not a bump. `npm-run-all` last
  shipped in 2018 and only provides the `run-p` in our `validate` script.
- **In-range bumps**: `renovate/vitest-monorepo` (`vitest` + `@vitest/coverage-v8` together), `renovate/msw-2.x`,
  `renovate/node-mocks-http-1.x`, `renovate/vite-tsconfig-paths-6.x`, `renovate/pnpm-11.x` (the `packageManager` field —
  INTERACTIONS §7).
- **Majors queued on the dashboard**: `renovate/major-react-router-monorepo` (the peer contract — §1),
  `renovate/typescript-7.x` (which `@signmax/config`'s peer cap forbids merging — §5), `renovate/vite-8.x` (§10),
  `renovate/chalk-6.x`, `renovate/tusbar-cache-control-3.x`, `renovate/eventsource-5.x` (§3).
- **Abandonment flags** (`abandonments:recommended`, no release in a year) — the dry-run reported exactly: `npm-run-all`
  (the replacement PR is the fix), `prom-client`, `cookie-parser`, `compression`, `tslib`. A prompt to check, not a
  verdict — and `tslib` is currently unused here, since nothing sets `importHelpers`.

## The gate: brief every PR before merging

**Version numbers don't decide safety.** A `1.x` minor can break us, a `0.x` minor is often trivial, maintainers
under-label breaking changes, and for a library "breaking" also depends on how our _consumers_ use the thing. The config
carries no risk heuristics beyond major-gating; the brief is the gate.

- **Early Monday (00:00–03:59, Europe/Tallinn):** the batch arrives. Groups come from the presets only — the monorepo
  sets that apply here (`react-router` + `@react-router/express`, `@sentry/*`, `vitest` + `@vitest/coverage-v8`) plus
  `harbor images`; everything else lands as its own PR, deliberately, so one broken dependency can't block the rest.
- **No automerge, anywhere.** Every PR — including lockfile maintenance — waits for a brief and a human.
- Default rate limits (2 PRs/hour inside a 4-hour window) can spill a big week into the next Monday; the dashboard's
  checkboxes force-create.

### Working a batch

1. Brief each PR, dependency by dependency: release notes against the surface we actually use (`src/`), the dependency's
   role (`peerDependencies` = the consumer contract; `dependencies`/`optionalDependencies` = shipped to consumers;
   `devDependencies` = ours alone), and `INTERACTIONS.md`. Verdict: merge clean / merge with steps / hold with a reason.
2. Merge lowest blast radius first: dev tooling and actions → devcontainer image → runtime `dependencies` → anything
   touching `peerDependencies`.
3. Update `CHANGELOG.md` → `### Unreleased` as you go (§6). Dependency commits are `chore(deps):`, so a consumer-visible
   change needs its own hand-written entry.
4. Release when the batch warrants it: bump `package.json`, tag, publish the GitHub Release. For runtime-affecting
   batches, prerelease first (`v<base>-<pre>.<n>` → the `canary` dist-tag) and try it in the monorepo.
5. Clear the dashboard: approve what the briefs cleared, hold the rest with the reason written down.

## Verification

1. **Detection** — the local platform does not auto-read `renovate.json5`; point at it or it runs default config:
   ```
   RENOVATE_CONFIG_FILE=renovate.json5 LOG_LEVEL=debug \
     npx --yes --package renovate renovate --platform=local --dry-run=extract
   ```
   Confirm all five dependency blocks extract from `package.json`, that `packageManager` extracts as its own npm dep,
   that both workflows yield actions _and_ the `node-version` `uses-with` value, and that the devcontainer image pin
   extracts.
2. **Grouping** — `--dry-run=lookup` prints a branch per update. Expected shape: `react-router` and
   `@react-router/express` share one branch (same monorepo), `@sentry/react-router` and `@sentry/profiling-node` share
   one, `vitest` and `@vitest/coverage-v8` share one, and each remaining dependency gets its own. A same-train pair
   arriving split means a preset monorepo group stopped matching — add a `groupName` rule rather than briefing them
   apart.
3. **Peer ranges** — peers widen, so a peer-CLI minor raises no PR; it flows in through `lockFileMaintenance`. A PR that
   raises or narrows a peer floor is a breaking release of this package, never routine (§1).
4. **Harbor** — the regex versioning must order the devcontainer's build counter: `36` has to show as a patch update to
   `35`, not a major (a major lands behind the dashboard gate instead of the weekly batch). A local dry-run logs
   `Failed to look up docker package …` because anonymous tag listing is rejected; that failure is expected locally and
   means nothing about the rule.
5. **Advisories** — this config raises no `[SECURITY]` PRs (`osvVulnerabilityAlerts` is off). Check the repository's
   Dependabot alerts tab with each batch and act on a mid-week advisory by hand.
