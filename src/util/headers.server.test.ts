import { format, parse } from "@tusbar/cache-control"
import { describe, expect, it } from "vitest"
import { getConservativeCacheControl, pipeHeaders } from "./headers.server"

describe("getConservativeCacheControl", () => {
  it("works for basic usecase", () => {
    const result = getConservativeCacheControl("max-age=3600", "max-age=1800, s-maxage=600", "private, max-age=86400")

    expect(result).toEqual(
      format({
        maxAge: 1800,
        sharedMaxAge: 600,
        private: true,
      })
    )
  })

  it("retains boolean directive", () => {
    const result = parse(getConservativeCacheControl("private", "no-cache,no-store"))

    expect(result.private).toEqual(true)
    expect(result.noCache).toEqual(true)
    expect(result.noStore).toEqual(true)
  })

  it("gets smallest number directive", () => {
    const result = parse(getConservativeCacheControl("max-age=10, s-maxage=300", "max-age=300, s-maxage=600"))

    expect(result.maxAge).toEqual(10)
    expect(result.sharedMaxAge).toEqual(300)
  })

  it("handles null values", () => {
    const result = getConservativeCacheControl(null, "max-age=3600", null)

    expect(result).toEqual(format({ maxAge: 3600 }))
  })

  it("handles empty array", () => {
    const result = getConservativeCacheControl()

    expect(result).toEqual("")
  })

  it("handles all null values", () => {
    const result = getConservativeCacheControl(null, null)

    expect(result).toEqual("")
  })

  it("handles single cache control header", () => {
    const result = getConservativeCacheControl("public, max-age=7200")

    expect(parse(result)).toMatchObject({
      public: true,
      maxAge: 7200,
    })
  })
})

describe("pipeHeaders", () => {
  it("should forward headers from loader", () => {
    const loaderHeaders = new Headers({
      "Cache-Control": "max-age=3600",
      Vary: "Accept",
      "Server-Timing": "db;dur=10",
    })
    const parentHeaders = new Headers()
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Cache-Control")).toBe("max-age=3600")
    expect(result.get("Vary")).toBe("Accept")
    expect(result.get("Server-Timing")).toBe("db;dur=10")
  })

  it("should use action headers when loader headers are empty", () => {
    const loaderHeaders = new Headers()
    const actionHeaders = new Headers({
      "Cache-Control": "no-cache",
      Vary: "Cookie",
    })
    const parentHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Cache-Control")).toBe("no-cache")
    expect(result.get("Vary")).toBe("Cookie")
  })

  it("should use error headers when provided", () => {
    const errorHeaders = new Headers({
      "Cache-Control": "no-store",
    })
    const loaderHeaders = new Headers({
      "Cache-Control": "max-age=3600",
    })
    const actionHeaders = new Headers()
    const parentHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders,
    })

    expect(result.get("Cache-Control")).toBe("no-store")
  })

  it("should merge Cache-Control conservatively with parent", () => {
    const loaderHeaders = new Headers({
      "Cache-Control": "max-age=7200",
    })
    const parentHeaders = new Headers({
      "Cache-Control": "max-age=3600",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    // Should use the more conservative (smaller) max-age
    const cacheControl = parse(result.get("Cache-Control")!)
    expect(cacheControl.maxAge).toBe(3600)
  })

  it("should append parent Vary headers", () => {
    const loaderHeaders = new Headers({
      Vary: "Accept",
    })
    const parentHeaders = new Headers({
      Vary: "Cookie",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Vary")).toBe("Accept, Cookie")
  })

  it("should append parent Server-Timing headers", () => {
    const loaderHeaders = new Headers({
      "Server-Timing": "db;dur=10",
    })
    const parentHeaders = new Headers({
      "Server-Timing": "cache;dur=5",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Server-Timing")).toBe("db;dur=10, cache;dur=5")
  })

  it("should fallback to parent Cache-Control if not present in loader", () => {
    const loaderHeaders = new Headers()
    const parentHeaders = new Headers({
      "Cache-Control": "max-age=1800",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Cache-Control")).toBe("max-age=1800")
  })

  it("should fallback to parent Vary if not present in loader", () => {
    const loaderHeaders = new Headers()
    const parentHeaders = new Headers({
      Vary: "Accept-Language",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Vary")).toBe("Accept-Language")
  })

  it("should not fallback if header exists in loader", () => {
    const loaderHeaders = new Headers({
      Vary: "Accept",
    })
    const parentHeaders = new Headers({
      Vary: "Cookie",
    })
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    // Should be Accept from loader + Cookie from parent (appended)
    expect(result.get("Vary")).toBe("Accept, Cookie")
  })

  it("should handle empty parent headers", () => {
    const loaderHeaders = new Headers({
      "Cache-Control": "max-age=3600",
    })
    const parentHeaders = new Headers()
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Cache-Control")).toBe("max-age=3600")
  })

  it("should not include non-forwarded headers from loader", () => {
    const loaderHeaders = new Headers({
      "Content-Type": "application/json",
      "X-Custom-Header": "value",
    })
    const parentHeaders = new Headers()
    const actionHeaders = new Headers()

    const result = pipeHeaders({
      parentHeaders,
      loaderHeaders,
      actionHeaders,
      errorHeaders: undefined,
    })

    expect(result.get("Content-Type")).toBeNull()
    expect(result.get("X-Custom-Header")).toBeNull()
  })
})
