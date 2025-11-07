import { type NextFunction, type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { noIndexMiddleware } from "./noindex.js"

describe("noIndexMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    req = {}
    res = {
      set: vi.fn(),
    }
    next = vi.fn()
  })

  it("should set X-Robots-Tag header", async () => {
    await noIndexMiddleware(req as Request, res as Response, next)

    expect(res.set).toHaveBeenCalledWith("X-Robots-Tag", "noindex, nofollow")
  })

  it("should call next", async () => {
    await noIndexMiddleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should set noindex and nofollow", async () => {
    await noIndexMiddleware(req as Request, res as Response, next)

    expect(res.set).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("noindex"))
    expect(res.set).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("nofollow"))
  })
})
