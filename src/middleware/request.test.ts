import { type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestMiddleware } from "./request"

// Mock the API client module
vi.mock("../api/client", () => ({
  createRequest: vi.fn(),
  createResponseMiddleware: vi.fn(),
}))

describe("requestMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    req = {}
    res = {}
    next = vi.fn()
  })

  it("should attach request function to req with default options", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    const middleware = requestMiddleware()

    await middleware(req as Request, res as Response, next)

    expect(createResponseMiddleware).toHaveBeenCalledWith(req, res, undefined)
    expect(createRequest).toHaveBeenCalledWith(req, res, mockResponseMiddleware, {})
    expect((req as Request).request).toBe(mockRequestFunc)
  })

  it("should call next", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    const middleware = requestMiddleware()

    await middleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should create response middleware before request", async () => {
    const callOrder: string[] = []
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockImplementation(() => {
      callOrder.push("createResponseMiddleware")
      return vi.fn()
    })
    vi.mocked(createRequest).mockImplementation(() => {
      callOrder.push("createRequest")
      return vi.fn()
    })

    const middleware = requestMiddleware()

    await middleware(req as Request, res as Response, next)

    expect(callOrder).toEqual(["createResponseMiddleware", "createRequest"])
  })

  it("should accept GraphQL client options", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    const middleware = requestMiddleware({
      endpoint: "https://api.example.com/graphql",
      sharedSecret: "secret123",
      sharedSecretHeader: "x-api-key",
    })

    await middleware(req as Request, res as Response, next)

    expect(createResponseMiddleware).toHaveBeenCalledWith(req, res, undefined)
    expect(createRequest).toHaveBeenCalledWith(req, res, mockResponseMiddleware, {
      endpoint: "https://api.example.com/graphql",
      sharedSecret: "secret123",
      sharedSecretHeader: "x-api-key",
    })
    expect((req as Request).request).toBe(mockRequestFunc)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should pass skipCookies option to createResponseMiddleware", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    const middleware = requestMiddleware({
      skipCookies: true,
      endpoint: "https://api.example.com/graphql",
    })

    await middleware(req as Request, res as Response, next)

    expect(createResponseMiddleware).toHaveBeenCalledWith(req, res, true)
    expect(createRequest).toHaveBeenCalledWith(req, res, mockResponseMiddleware, {
      endpoint: "https://api.example.com/graphql",
    })
  })

  it("should pass passthrough headers options", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    const middleware = requestMiddleware({
      passthroughHeaders: ["x-custom-header"],
      includeDefaultPassthroughHeaders: false,
    })

    await middleware(req as Request, res as Response, next)

    expect(createRequest).toHaveBeenCalledWith(req, res, mockResponseMiddleware, {
      passthroughHeaders: ["x-custom-header"],
      includeDefaultPassthroughHeaders: false,
    })
  })
})
