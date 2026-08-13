export const meta = {
  name: "upgrade-research",
  description:
    "Impact-brief every open Renovate PR (or a given subset) — per-dep, grounded in our usage + landmines — and order them for the session",
  phases: [
    { title: "Discover", detail: "list open Renovate PRs + the deps each one changes" },
    { title: "Research", detail: "per PR: fan out a per-dep impact check, synthesize a PR verdict" },
    { title: "Order", detail: "sequence the PRs for this merge session" },
  ],
}

// THE GATE (docs/upgrades/RUNBOOK.md). Renovate is mechanical; version numbers don't tell us what
// breaks for HOW WE USE a thing. So every PR gets a brief before it's merged — not just majors, not
// just 0.x. Run on-demand before working a batch:
//   Workflow({ name: 'upgrade-research' })                 // brief ALL open Renovate PRs
//   Workflow({ name: 'upgrade-research', args: [5, 12] })  // brief only these PR numbers
// Read-only: repo + web only. Merging here is NOT a deploy — this is a published library; changes
// reach consumers via a GitHub Release + a monorepo catalog bump (INTERACTIONS §6). Nothing in this
// workflow merges or releases anything.

const PRS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prs"],
  properties: {
    prs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "title", "branch", "deps"],
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          branch: { type: "string" },
          deps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "from", "to", "updateType"],
              properties: {
                name: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                updateType: { type: "string" },
              },
            },
          },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
}

const DEP_VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "from", "to", "breakingForUs", "rationale", "requiredChanges", "interactions", "confidence"],
  properties: {
    name: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    // breaking FOR US — i.e. the change touches config/behaviour we actually rely on, or the consumer
    // contract (peer ranges). NOT "has a breaking-changes section in general". Default to true when
    // genuinely uncertain.
    breakingForUs: { type: "boolean" },
    rationale: { type: "string" }, // what changed + whether we use that surface (cite the repo path checked)
    requiredChanges: { type: "array", items: { type: "string" } },
    interactions: { type: "array", items: { type: "string" } }, // matched docs/upgrades/INTERACTIONS.md entries + manual step
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
}

const PR_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["number", "title", "verdict", "deps", "requiredSteps", "surfaces", "notes"],
  properties: {
    number: { type: "number" },
    title: { type: "string" },
    verdict: { type: "string", enum: ["merge-clean", "merge-with-steps", "hold"] },
    deps: { type: "array", items: DEP_VERDICT_SCHEMA },
    requiredSteps: { type: "array", items: { type: "string" } }, // ordered manual steps before/around merge
    surfaces: { type: "array", items: { type: "string" } }, // dep types + src modules touched: peerDeps, src/growthbook.ts, ci, devcontainer, ...
    notes: { type: "string" },
  },
}

const SESSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["order", "notes"],
  properties: {
    order: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "rank", "verdict", "why"],
        properties: {
          number: { type: "number" },
          rank: { type: "number" },
          verdict: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
}

const only = Array.isArray(args) ? args.map(String) : args != null ? [String(args)] : null

phase("Discover")
const discovered = await agent(
  `List open Renovate PRs in this repo and the dependencies each one changes.
   Use \`gh pr list --state open --json number,title,headRefName,author\` and keep only PRs whose author is
   the Renovate bot (skyltmax-renovate / renovate / mend).${only ? ` Restrict to PR numbers: ${only.join(", ")}.` : ""}
   For each kept PR, read its body/diff (\`gh pr view <n> --json body\`, \`gh pr diff <n>\`) and extract every
   dependency it bumps as {name, from, to, updateType (major|minor|patch)}. A grouped PR has many deps.
   Also record which files it touches (package.json — and WHICH dependency block — vs .github/workflows
   vs .devcontainer/docker-compose.yml tells you the surface). Return the structured list.`,
  { phase: "Discover", schema: PRS_SCHEMA }
)

const prs = (discovered?.prs || []).filter(Boolean)
if (!prs.length) {
  log("No open Renovate PRs to research.")
  return { briefs: [], session: null }
}
log(`Briefing ${prs.length} PR(s): ${prs.map(p => "#" + p.number).join(", ")}`)

phase("Research")
// Per PR: fan out one impact check per dep (parallel), then synthesize a single PR verdict.
const briefs = (
  await pipeline(prs, pr =>
    parallel(
      pr.deps.map(
        d => () =>
          agent(
            `Impact-check ${d.name} ${d.from} -> ${d.to} (${d.updateType}) for THIS repo — is it breaking for how WE use it?
       This is @signmax/remix-base, a published library consumed by the skyltmax monorepo BFFs.
       1. Changelog/release notes between ${d.from} and ${d.to} (WebSearch/WebFetch; for GitHub-hosted, the
          CHANGELOG.md or releases). Maintainers under-label breaking changes — read the actual diff of
          behaviour, not just a "breaking" header. 0.x vs 1.x is irrelevant; judge the content.
       2. Grep the repo for how we use ${d.name}: which src/ modules import it, and which package.json
          block it sits in. dependencies = runtime for every consumer; devDependencies = repo-only
          tooling; peerDependencies = the CONSUMER CONTRACT (a floor-raise forces every consumer to
          upgrade — breaking for the package even if our code is untouched); optionalDependencies =
          feature-gated (growthbook/eventsource). Cite the path you checked.
       3. Cross-ref docs/upgrades/INTERACTIONS.md — list any entry this triggers + its manual step
          (growthbook bumps ALWAYS trigger §3; peer changes §1; image PRs §2; anything eslint/prettier/
          typescript/@signmax/config §5; lockfile-maintenance and pnpm-version PRs §7).
       4. Verdict: breakingForUs (default true if genuinely unsure), requiredChanges, confidence.`,
            { label: `dep:${d.name}`, phase: "Research", schema: DEP_VERDICT_SCHEMA }
          )
      )
    ).then(verdicts =>
      agent(
        `PR #${pr.number} "${pr.title}" bumps these deps; here are the per-dep impact checks as JSON:
     ${JSON.stringify(verdicts.filter(Boolean), null, 2)}
     Synthesize ONE brief for this PR: overall verdict (merge-clean | merge-with-steps | hold), the ordered
     manual steps required before/around merge (include every interactions step verbatim; image PRs need
     the boot.sh CHANGELOG_DISPLAYED marker bump committed on the PR), which surfaces it touches (dep
     types + src modules + ci/devcontainer), and notes. Remember: merging does NOT publish — consumer-
     visible changes need a CHANGELOG.md Unreleased entry and reach consumers via a release + monorepo
     catalog bump (INTERACTIONS §6). Carry the per-dep verdicts through unchanged.`,
        { label: `brief:#${pr.number}`, phase: "Research", schema: PR_BRIEF_SCHEMA }
      )
    )
  )
).filter(Boolean)

phase("Order")
const session = await agent(
  `Here are impact briefs for ${briefs.length} Renovate PRs:\n${JSON.stringify(briefs, null, 2)}\n
   Produce a merge order for this session: lowest blast radius first. Rough tiering: dev tooling and
   github-actions → devcontainer image → runtime deps (dependencies/optionalDependencies) → anything
   touching peerDependencies (the consumer contract), 'hold' PRs last with the reason. Merging does not
   deploy, but note in the plan where a canary release + monorepo validation should happen (after the
   runtime-affecting merges, before a stable release). For each PR give rank, its verdict, and a one-line
   why. Notes: cross-PR interactions (e.g. a @signmax/config bump that changes lint rules should merge
   before PRs that would then need reformatting).`,
  { phase: "Order", schema: SESSION_SCHEMA }
)

return { session, briefs }
