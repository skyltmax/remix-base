import { type Request, type Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { endingSlashMiddleware } from "./ending_slash"

describe("endingSlashMiddleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: ReturnType<typeof vi.fn>

  beforeEach(() => {
    res = {
      redirect: vi.fn(),
    }
    next = vi.fn()
  })

  it("should not redirect root path with trailing slash", async () => {
    req = {
      path: "/",
      url: "/",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should redirect paths with trailing slash", async () => {
    req = {
      path: "/about/",
      url: "/about/",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).toHaveBeenCalledWith(302, "/about")
    expect(next).not.toHaveBeenCalled()
  })

  it("should preserve query string when redirecting", async () => {
    req = {
      path: "/about/",
      url: "/about/?foo=bar&baz=qux",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).toHaveBeenCalledWith(302, "/about?foo=bar&baz=qux")
    expect(next).not.toHaveBeenCalled()
  })

  it("should handle multiple trailing slashes", async () => {
    req = {
      path: "/about///",
      url: "/about///",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    // The implementation only removes the last character and then normalizes internal slashes
    // So "/about///" becomes "/about//" (after slice(0, -1)) then "/about/" (after replace)
    expect(res.redirect).toHaveBeenCalledWith(302, "/about/")
    expect(next).not.toHaveBeenCalled()
  })

  it("should not redirect paths without trailing slash", async () => {
    req = {
      path: "/about",
      url: "/about",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it("should handle nested paths with trailing slash", async () => {
    req = {
      path: "/api/users/",
      url: "/api/users/?page=2",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).toHaveBeenCalledWith(302, "/api/users?page=2")
    expect(next).not.toHaveBeenCalled()
  })

  it("should handle paths with multiple consecutive slashes in the middle", async () => {
    req = {
      path: "/api//users/",
      url: "/api//users/",
    }

    await endingSlashMiddleware(req as Request, res as Response, next)

    expect(res.redirect).toHaveBeenCalledWith(302, "/api/users")
    expect(next).not.toHaveBeenCalled()
  })
})
