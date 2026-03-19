import * as Sentry from "@sentry/react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { init } from "./instrumentation.js"

vi.mock("@sentry/react-router", () => ({
  init: vi.fn(),
  httpIntegration: vi.fn(() => "httpIntegration"),
  pinoIntegration: vi.fn(() => "pinoIntegration"),
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
    init({ environment: "staging" })

    expect(sentryInit).toHaveBeenCalledWith(expect.objectContaining({ environment: "staging" }))
  })

  it("falls back to NODE_ENV when environment is not provided", () => {
    process.env.NODE_ENV = "production"
    init(baseConfig)

    expect(sentryInit.mock.calls[0]?.[0]?.environment).toBe("production")
  })

  it("defaults environment to development when NODE_ENV is not set", () => {
    init(baseConfig)

    expect(sentryInit.mock.calls[0]?.[0]?.environment).toBe("development")
  })

  it("applies configuration overrides", () => {
    init({
      tracesSampleRate: 0.75,
      profileSessionSampleRate: 0.25,
      sendDefaultPii: false,
      enabled: true,
    })

    expect(sentryInit).toHaveBeenCalled()
    const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]> &
      Record<string, unknown>

    expect(options.tracesSampleRate).toBe(0.75)
    expect(options.profileSessionSampleRate).toBe(0.25)
    expect(options.sendDefaultPii).toBe(false)
    expect(options.enabled).toBe(true)

    const sampler = options.tracesSampler
    expect(sampler?.({ request: { url: "/readyz" } } as never)).toBe(0)
    expect(sampler?.({ request: { url: "/home" } } as never)).toBe(0.75)
  })

  it("sets default values", () => {
    init(baseConfig)

    const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]> &
      Record<string, unknown>

    expect(options.sendDefaultPii).toBe(true)
    expect(options.enableLogs).toBe(true)
    expect(options.profileLifecycle).toBe("trace")
    expect(options.release).toBe("revision")
  })

  it("includes integrations", () => {
    init(baseConfig)

    const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]>
    expect(options.integrations).toEqual(["httpIntegration", "profilingIntegration", "pinoIntegration"])
  })

  describe("tracesSampler", () => {
    function getSampler() {
      const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]> &
        Record<string, unknown>
      return options.tracesSampler as (ctx: { request?: { url?: string } }) => number
    }

    it("drops /readyz requests", () => {
      init(baseConfig)
      expect(getSampler()({ request: { url: "/readyz" } })).toBe(0)
    })

    it("drops /livez requests", () => {
      init(baseConfig)
      expect(getSampler()({ request: { url: "/livez" } })).toBe(0)
    })

    it("uses default rate of 1 for other requests", () => {
      init(baseConfig)
      expect(getSampler()({ request: { url: "/home" } })).toBe(1)
    })

    it("uses configured rate for other requests", () => {
      init({ ...baseConfig, tracesSampleRate: 0.5 })
      expect(getSampler()({ request: { url: "/home" } })).toBe(0.5)
    })
  })

  describe("beforeSendLog", () => {
    function getBeforeSendLog() {
      const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]>
      return options.beforeSendLog!
    }

    it("filters logs for denied URLs", () => {
      init(baseConfig)
      const beforeSendLog = getBeforeSendLog()

      const event = {
        attributes: { req: { url: "/readyz", method: "GET" } },
        message: "request completed",
      }
      expect(beforeSendLog(event as never)).toBeNull()
    })

    it("filters logs for static asset URLs", () => {
      init(baseConfig)
      const beforeSendLog = getBeforeSendLog()

      for (const url of ["/build/main.js", "/fonts/arial.woff", "/favicon.ico"]) {
        const event = {
          attributes: { req: { url, method: "GET" } },
          message: "request completed",
        }
        expect(beforeSendLog(event as never)).toBeNull()
      }
    })

    it("rewrites message for completed requests", () => {
      init(baseConfig)
      const beforeSendLog = getBeforeSendLog()

      const event = {
        attributes: { req: { url: "/api/data", method: "POST" } },
        message: "request completed",
      }
      const result = beforeSendLog(event as never) as unknown as typeof event
      expect(result.message).toBe("POST /api/data")
    })

    it("removes req and res attributes", () => {
      init(baseConfig)
      const beforeSendLog = getBeforeSendLog()

      const event = {
        attributes: { req: { url: "/api", method: "GET" }, res: { statusCode: 200 }, other: "keep" },
        message: "request completed",
      }
      const result = beforeSendLog(event as never) as unknown as typeof event
      expect(result.attributes?.req).toBeUndefined()
      expect(result.attributes?.res).toBeUndefined()
      expect(result.attributes?.other).toBe("keep")
    })

    it("passes through normal log events", () => {
      init(baseConfig)
      const beforeSendLog = getBeforeSendLog()

      const event = { attributes: {}, message: "something happened" }
      expect(beforeSendLog(event as never)).toBe(event)
    })
  })

  describe("beforeSend", () => {
    function getBeforeSend() {
      const options = sentryInit.mock.calls[0]?.[0] as NonNullable<Parameters<typeof Sentry.init>[0]>
      return options.beforeSend!
    }

    it("filters NotFoundException errors", () => {
      init(baseConfig)
      const beforeSend = getBeforeSend()

      const event = {
        exception: { values: [{ type: "NotFoundException", value: "Not Found" }] },
      }
      expect(beforeSend(event as never, {} as never)).toBeNull()
    })

    it("filters errors containing 404", () => {
      init(baseConfig)
      const beforeSend = getBeforeSend()

      const event = {
        exception: { values: [{ type: "Error", value: "Response status 404" }] },
      }
      expect(beforeSend(event as never, {} as never)).toBeNull()
    })

    it("passes through other errors", () => {
      init(baseConfig)
      const beforeSend = getBeforeSend()

      const event = {
        exception: { values: [{ type: "TypeError", value: "Cannot read property" }] },
      }
      expect(beforeSend(event as never, {} as never)).toBe(event)
    })

    it("passes through events without exceptions", () => {
      init(baseConfig)
      const beforeSend = getBeforeSend()

      const event = { message: "plain event" }
      expect(beforeSend(event as never, {} as never)).toBe(event)
    })
  })
})
