# Upgrade runbook

How we keep every dependency in this repo current. Two layers, same model as skyltmax/skyltmax and skyltmax/infra
(`docs/upgrades/RUNBOOK.md` there):

- **Layer 1 — Renovate (mechanical):** detects pins, opens bump PRs, refreshes the lockfile, dumps changelogs. Config:
  [`renovate.json5`](../../renovate.json5). It has zero awareness of our usage.
- **Layer 2 — Claude research/orchestration (the value):** per-upgrade impact briefs grounded in this repo +
  [`INTERACTIONS.md`](INTERACTIONS.md). This is what decides what actually merges.

**Key difference from skyltmax/skyltmax: merging is NOT deploying.** This is a published library
(`@signmax/remix-base`). A merged Renovate PR only changes `main`; consumers get it when a GitHub Release is cut
(`release.yml` publishes to npm) and the consuming repo bumps its catalog entry. So the pre-merge brief gates the
correctness of `main`, and the release step is the consumer-facing gate — validate runtime-affecting batches with a
canary prerelease in the monorepo before a stable release (INTERACTIONS §5).

Scope: npm (`package.json` — dependencies, devDependencies, peerDependencies, optionalDependencies — plus
`pnpm-lock.yaml`), github-actions (`.github/workflows/`), and the harbor.signmax.cloud devcontainer image pin in
`.devcontainer/docker-compose.yml` (docker-compose manager; the harbor `public` project allows anonymous pulls). No
`# renovate:` annotations are needed anywhere.

---

## One-time setup

Renovate runs self-hosted (Mend Renovate CE on the staging cluster, see skyltmax/infra
`docs/learnings/renovate-selfhosted.md`). Renovate reads config from the **default branch only**, so the order matters:

1. **Merge `renovate.json5` to `main` first.** With config present on `main`, Renovate treats the repo as onboarded and
   skips the generic onboarding PR.
2. **Widen the CE discovery filter** in skyltmax/infra: `terraform/main/renovate.tf` (`mendRnvAutoDiscoverFilter`) — add
   `skyltmax/remix-base`, apply.
3. **Install the dedicated Renovate GitHub App on this repo** (the CE app identity, not the Mend cloud app): Org →
   Settings → GitHub Apps → configure the self-hosted app → add `skyltmax/remix-base`.
4. **Validate config** after any edit: `npx --yes --package renovate renovate-config-validator renovate.json5`.
5. **CI gate:** the GitHub Actions checks (`test`, `lint`, `typecheck`, `format`) are the green floor every PR must pass
   before a human merges it.
6. **Research is run on-demand** before each batch (`Workflow({ name: 'upgrade-research' })`) — see "The gate" below.

## The gate: research every PR before merging

**Version numbers don't decide safety here.** A `1.x` minor can break us (a changed default, a removed deprecation,
stricter validation); a `0.x` minor is often trivial. Maintainers under-label breaking changes, and "breaking" depends
on _how we use the thing_. So `renovate.json5` carries **no risk heuristics beyond major-gating** (which only controls
PR cadence/noise) — the real gate is an **impact brief on every PR**, run on-demand right before you merge a batch.

- **Monday:** Renovate raises/refreshes grouped PRs (`schedule`). Minor+patch grouped per ecosystem (js / actions);
  lockstep and high-importance sets (react-router, sentry, growthbook, first-party, harbor images) get their own PRs;
  majors queue on the Dependency Dashboard.
- **No automerge, anywhere.** Every PR — including lockfile maintenance — waits for a brief + a human.

### Working a batch (on-demand research)

1. **Brief the PRs you're about to touch:**
   ```
   Workflow({ name: 'upgrade-research' })            # brief ALL open Renovate PRs
   Workflow({ name: 'upgrade-research', args: [5] }) # brief just PR #5 (the batch in hand)
   ```
   For each PR it fans out one impact check **per dependency** — changelog × _do we use that surface?_ (greps `src/`,
   classifies the dep type: peer = consumer contract) × [`INTERACTIONS.md`](INTERACTIONS.md) — and returns a per-PR
   verdict (`merge-clean` / `merge-with-steps` / `hold`), the ordered manual steps, and which surfaces it touches.
   Read-only; it never merges.
2. **Merge per the brief**, lowest blast radius first: dev tooling and github-actions → devcontainer image → runtime
   deps (dependencies/optionalDependencies) → anything touching peerDependencies (the consumer contract).
3. **Release when the batch warrants it:** runtime-affecting merges reach consumers only via a release. Cut a canary
   prerelease (`v<base>-<pre>.<n>` tag, `package.json` keeps the base version), validate in the monorepo, then release
   stable. Keep `CHANGELOG.md` → `### Unreleased` current as PRs merge.
4. **Clear the dashboard:** approve what the briefs cleared; `hold` the rest with the reason.

Brief/verdict shapes are the schemas in
[`.claude/workflows/upgrade-research.js`](../../.claude/workflows/upgrade-research.js).

## Verification

1. **Detection vs expectation:** the local platform does **not** auto-read `renovate.json5` — point at it explicitly or
   it silently runs default config:
   ```
   RENOVATE_CONFIG_FILE=renovate.json5 LOG_LEVEL=debug \
     npx --yes --package renovate renovate --platform=local --dry-run=extract
   ```
   Confirm: all four dependency blocks of `package.json` extract, github-actions sees `ci.yml` + `release.yml`, and the
   devcontainer image pin extracts from `.devcontainer/docker-compose.yml`.
2. **Peer ranges:** peerDependencies widen rather than bump (Renovate default), so react-router/express minors will NOT
   raise PRs — in-range updates flow via lockFileMaintenance. Only majors surface. A PR that _narrows_ or _raises the
   floor_ of a peer range is wrong by default (INTERACTIONS §2).
3. **Harbor image updates:** confirm the CE worker lists tags from harbor.signmax.cloud anonymously and the regex
   versioning orders rebuild suffixes correctly — a new `devcontainer:rails-4.0.6-26` must show as an update to
   `rails-4.0.6-25`. A wrong versioning match shows as "no update" while infra keeps publishing.
4. **Brief quality:** run `upgrade-research` on a known-footgun PR (a growthbook group PR is ideal — INTERACTIONS §3)
   and confirm the brief surfaces the right entry. A miss = the knowledge base or prompt needs work.
