import * as Sentry from "@sentry/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { init } from "./instrumentation.js"

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  httpIntegration: vi.fn(() => "httpIntegration"),
}))

vi.mock("@sentry/profiling-node", () => ({
  nodeProfilingIntegration: vi.fn(() => "profilingIntegration"),
}))

vi.mock("./util/revision", () => ({
  getRevision: vi.fn(() => "revision"),
}))

describe("init", () => {
  const sentryInit = vi.mocked(Sentry.init)
  const originalNodeEnv = process.env.NODE_ENV
  const baseConfig = { dsn: "https://public@sentry.invalid/1" }

  beforeEach(() => {
    sentryInit.mockClear()
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it("uses configured environment when provided", () => {
    init({ ...baseConfig, configuration: { environment: "staging" } })

    expect(sentryInit).toHaveBeenCalledWith(expect.objectContaining({ environment: "staging" }))
  })

  it("falls back to NODE_ENV when environment is not provided", () => {
    process.env.NODE_ENV = "production"
    init(baseConfig)

    expect(sentryInit.mock.calls[0]?.[0]?.environment).toBe("production")
  })

  it("applies configuration overrides", () => {
    init({
      ...baseConfig,
      configuration: {
        tracesSampleRate: 0.75,
        profilesSampleRate: 0.25,
        sendDefaultPii: false,
        enabled: true,
      },
    })

    expect(sentryInit).toHaveBeenCalled()
    const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]>

    expect(options.tracesSampleRate).toBe(0.75)
    expect(options.profilesSampleRate).toBe(0.25)
    expect(options.sendDefaultPii).toBe(false)
    expect(options.enabled).toBe(true)

    const sampler = options.tracesSampler
    expect(sampler?.({ request: { url: "/readyz" } } as never)).toBe(0)
    expect(sampler?.({ request: { url: "/home" } } as never)).toBe(0.75)
  })
})
