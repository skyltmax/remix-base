import * as Sentry from "@sentry/node"
import { type NextFunction, type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sentryIPMiddleware } from "./sentry_ip.js"

// Mock Sentry
vi.mock("@sentry/node", () => ({
  setUser: vi.fn(),
}))

describe("sentryIPMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    req = {
      ip: "192.168.1.1",
    }
    res = {}
    next = vi.fn()
    next = vi.fn()
  })

  it("should set IP address in Sentry user context", async () => {
    await sentryIPMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "192.168.1.1" })
  })

  it("should call next", async () => {
    await sentryIPMiddleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should handle undefined IP", async () => {
    req = {
      ip: undefined,
    }

    await sentryIPMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: undefined })
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should handle IPv6 addresses", async () => {
    req = {
      ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    }

    await sentryIPMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "2001:0db8:85a3:0000:0000:8a2e:0370:7334" })
  })

  it("should handle localhost IP", async () => {
    req = {
      ip: "127.0.0.1",
    }

    await sentryIPMiddleware(req as Request, res as Response, next)

    expect(Sentry.setUser).toHaveBeenCalledWith({ ip_address: "127.0.0.1" })
  })
})
