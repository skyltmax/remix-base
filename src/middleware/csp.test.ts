import { type NextFunction, type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cspMiddleware } from "./csp.js"

describe("cspMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    req = {}
    res = {
      locals: {},
    }
    next = vi.fn()
  })

  it("should generate a CSP nonce", async () => {
    await cspMiddleware(req as Request, res as Response, next)

    expect(res.locals?.cspNonce).toBeDefined()
    expect(typeof res.locals?.cspNonce).toBe("string")
    expect(res.locals?.cspNonce?.length).toBeGreaterThan(0)
  })

  it("should generate unique nonces on each call", async () => {
    const res1: Partial<Response> = { locals: {} }
    const res2: Partial<Response> = { locals: {} }

    await cspMiddleware(req as Request, res1 as Response, next)
    await cspMiddleware(req as Request, res2 as Response, next)

    expect(res1.locals?.cspNonce).toBeDefined()
    expect(res2.locals?.cspNonce).toBeDefined()
    expect(res1.locals?.cspNonce).not.toBe(res2.locals?.cspNonce)
  })

  it("should call next", async () => {
    await cspMiddleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should generate hex string of 32 characters", async () => {
    await cspMiddleware(req as Request, res as Response, next)

    expect(res.locals?.cspNonce).toMatch(/^[0-9a-f]{32}$/)
  })
})
