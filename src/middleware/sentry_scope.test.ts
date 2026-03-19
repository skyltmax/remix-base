import * as Sentry from "@sentry/react-router"
import { type NextFunction, type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sentryScopeMiddleware } from "./sentry_scope.js"

// Mock Sentry
const mockSetAttributes = vi.fn()
const mockSetTags = vi.fn()
vi.mock("@sentry/react-router", () => ({
  setUser: vi.fn(),
  getIsolationScope: vi.fn(() => ({
    setAttributes: mockSetAttributes,
    setTags: mockSetTags,
  })),
}))

function createReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    ip: "192.168.1.1",
    method: "GET",
    path: "/test",
    hostname: "example.com",
    query: {},
    body: {},
    get: vi.fn(),
    ...overrides,
  }
}

function createRes(): Partial<Response> & { _trigger: (event: string) => void } {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    statusCode: 200,
    get: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] ??= []
      listeners[event].push(cb)
    }) as unknown as Response["on"],
    _trigger(event: string) {
      for (const cb of listeners[event] ?? []) cb()
    },
  }
}

describe("sentryScopeMiddleware", () => {
  let req: Partial<Request>
  let res: ReturnType<typeof createRes>
  let next: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    req = createReq()
    res = createRes()
    next = vi.fn()
  })

  it("should set IP address in Sentry user context", async () => {
    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "192.168.1.1" })
  })

  it("should call next", async () => {
    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should handle undefined IP", async () => {
    req = createReq({ ip: undefined })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: undefined })
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should handle IPv6 addresses", async () => {
    req = createReq({ ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334" })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "2001:0db8:85a3:0000:0000:8a2e:0370:7334" })
  })

  it("should handle localhost IP", async () => {
    req = createReq({ ip: "127.0.0.1" })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "127.0.0.1" })
  })

  it("should set request attributes and tags on isolation scope", async () => {
    const getMock = vi.fn((header: string) => {
      if (header === "Referrer") return "https://google.com"
      if (header === "User-Agent") return "TestAgent/1.0"
      if (header === "Origin") return "https://example.com"
      return undefined
    })
    req = createReq({
      ip: "10.0.0.1",
      method: "POST",
      path: "/api/data",
      hostname: "api.example.com",
      get: getMock as Request["get"],
      query: {},
      body: {},
    })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    const expectedValues = {
      "http.req.id": undefined,
      "http.req.method": "POST",
      "http.req.path": "/api/data",
      "http.req.host": "api.example.com",
      "http.req.ip_address": "10.0.0.1",
      "http.req.referrer": "https://google.com",
      "http.req.user_agent": "TestAgent/1.0",
      "http.req.origin": "https://example.com",
      "http.req.params": undefined,
    }

    expect(mockSetAttributes).toHaveBeenCalledWith(expectedValues)
    expect(mockSetTags).toHaveBeenCalledWith(expectedValues)
  })

  it("should include string request id", async () => {
    req = createReq({ id: "req-123" } as Partial<Request>)

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(mockSetAttributes).toHaveBeenCalledWith(expect.objectContaining({ "http.req.id": "req-123" }))
  })

  it("should include numeric request id", async () => {
    req = createReq({ id: 42 } as Partial<Request>)

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(mockSetAttributes).toHaveBeenCalledWith(expect.objectContaining({ "http.req.id": 42 }))
  })

  it("should handle hostname throwing an error", async () => {
    req = createReq()
    Object.defineProperty(req, "hostname", {
      get() {
        throw new Error("hostname error")
      },
    })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(mockSetAttributes).toHaveBeenCalledWith(expect.objectContaining({ "http.req.host": undefined }))
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should serialize query and body params", async () => {
    req = createReq({
      query: { page: "1", sort: "name" },
      body: { search: "test" },
    })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    expect(mockSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "http.req.params": JSON.stringify({ page: "1", sort: "name", search: "test" }),
      })
    )
  })

  it("should filter sensitive params", async () => {
    req = createReq({
      query: {},
      body: { username: "alice", password: "s3cret", token: "abc123" },
    })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    const params = JSON.parse((mockSetAttributes.mock.calls[0]?.[0] as Record<string, string>)["http.req.params"]!)
    expect(params.username).toBe("alice")
    expect(params.password).toBe("[FILTERED]")
    expect(params.token).toBe("[FILTERED]")
  })

  it("should truncate long param values", async () => {
    const longValue = "x".repeat(3000)
    req = createReq({ query: { data: longValue }, body: {} })

    await sentryScopeMiddleware(req as Request, res as Response, next)

    const params = JSON.parse((mockSetAttributes.mock.calls[0]?.[0] as Record<string, string>)["http.req.params"]!)
    expect(params.data).toContain("[truncated]")
    expect(params.data.length).toBeLessThan(longValue.length)
  })

  it("should set response attributes on finish", async () => {
    const resGetMock = vi.fn((header: string) => {
      if (header === "Location") return "/redirected"
      return undefined
    })
    res = createRes()
    res.statusCode = 302
    res.get = resGetMock as Response["get"]

    await sentryScopeMiddleware(req as Request, res as Response, next)

    // Reset to isolate the finish call
    mockSetAttributes.mockClear()
    mockSetTags.mockClear()

    res._trigger("finish")

    expect(mockSetAttributes).toHaveBeenCalledWith({
      "http.res.status": 302,
      "http.res.location": "/redirected",
    })
    expect(mockSetTags).toHaveBeenCalledWith({
      "http.res.status": 302,
      "http.res.location": "/redirected",
    })
  })
})
