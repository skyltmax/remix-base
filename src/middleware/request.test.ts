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

  it("should attach request function to req", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    await requestMiddleware(req as Request, res as Response, next)

    expect(createResponseMiddleware).toHaveBeenCalledWith(req, res)
    expect(createRequest).toHaveBeenCalledWith(req, res, mockResponseMiddleware)
    expect((req as Request).request).toBe(mockRequestFunc)
  })

  it("should call next", async () => {
    const mockRequestFunc = vi.fn()
    const mockResponseMiddleware = vi.fn()
    const { createRequest, createResponseMiddleware } = await import("../api/client")

    vi.mocked(createResponseMiddleware).mockReturnValue(mockResponseMiddleware)
    vi.mocked(createRequest).mockReturnValue(mockRequestFunc)

    await requestMiddleware(req as Request, res as Response, next)

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

    await requestMiddleware(req as Request, res as Response, next)

    expect(callOrder).toEqual(["createResponseMiddleware", "createRequest"])
  })
})
