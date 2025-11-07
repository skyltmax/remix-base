import { type NextFunction, type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { helmetMiddleware } from "./helmet.js"

// Mock @nichtsam/helmet
vi.mock("@nichtsam/helmet/node-http", () => ({
  helmet: vi.fn(),
}))

describe("helmetMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    req = {}
    res = {}
    next = vi.fn()
  })

  it("should call helmet with correct configuration", async () => {
    const { helmet } = await import("@nichtsam/helmet/node-http")

    await helmetMiddleware(req as Request, res as Response, next)

    expect(helmet).toHaveBeenCalledWith(res, {
      general: { referrerPolicy: false },
      content: false,
    })
  })

  it("should call next after setting headers", async () => {
    await helmetMiddleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should disable referrerPolicy", async () => {
    const { helmet } = await import("@nichtsam/helmet/node-http")

    await helmetMiddleware(req as Request, res as Response, next)

    const callArgs = vi.mocked(helmet).mock.calls[0]
    if (!callArgs) throw new Error("helmet was not called")
    expect(callArgs[1]).toHaveProperty("general")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((callArgs[1] as any).general.referrerPolicy).toBe(false)
  })

  it("should disable content security policy", async () => {
    const { helmet } = await import("@nichtsam/helmet/node-http")

    await helmetMiddleware(req as Request, res as Response, next)

    const callArgs = vi.mocked(helmet).mock.calls[0]
    if (!callArgs) throw new Error("helmet was not called")
    expect(callArgs[1]?.content).toBe(false)
  })
})
