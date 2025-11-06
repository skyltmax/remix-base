import { beforeEach, describe, expect, it, vi } from "vitest"
import { combineServerTimings, getServerTimeHeader, makeTimings, time, type Timings } from "./timing.server"

describe("timing.server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("makeTimings", () => {
    it("should create a timings object with start time", () => {
      const timings = makeTimings("db", "query users")

      expect(timings).toHaveProperty("db")
      expect(timings.db).toHaveLength(1)
      expect(timings.db![0]).toHaveProperty("desc", "query users")
      expect(timings.db![0]).toHaveProperty("start")
      expect(typeof timings.db![0]!.start).toBe("number")
    })

    it("should create timings without description", () => {
      const timings = makeTimings("api")

      expect(timings).toHaveProperty("api")
      expect(timings.api![0]).toHaveProperty("start")
      expect(timings.api![0]!.desc).toBeUndefined()
    })

    it("should have toString method", () => {
      const timings = makeTimings("test", "description")

      expect(typeof timings.toString).toBe("function")
      expect(timings.toString()).toMatch(/test/)
    })

    it("toString should not be enumerable", () => {
      const timings = makeTimings("test")

      expect(Object.keys(timings)).not.toContain("toString")
      expect(Object.getOwnPropertyDescriptor(timings, "toString")?.enumerable).toBe(false)
    })
  })

  describe("time", () => {
    it("should time a synchronous function", async () => {
      const timings = makeTimings("init")
      const fn = () => "result"

      const result = await time(fn, { type: "compute", desc: "calculation", timings })

      expect(result).toBe("result")
      expect(timings).toHaveProperty("compute")
      expect(timings.compute![0]).toHaveProperty("time")
      expect(timings.compute![0]).toHaveProperty("desc", "calculation")
    })

    it("should time an async function", async () => {
      const timings = makeTimings("init")
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return "async result"
      }

      const result = await time(fn, { type: "async", desc: "async op", timings })

      expect(result).toBe("async result")
      expect(timings).toHaveProperty("async")
      expect(timings.async![0]).toHaveProperty("time")
      expect(timings.async![0]!.time).toBeGreaterThanOrEqual(0)
    })

    it("should time a promise", async () => {
      const timings = makeTimings("init")
      const promise = Promise.resolve(42)

      const result = await time(promise, { type: "promise", timings })

      expect(result).toBe(42)
      expect(timings).toHaveProperty("promise")
      expect(timings.promise![0]).toHaveProperty("time")
    })

    it("should work without timings object", async () => {
      const fn = () => "no timing"

      const result = await time(fn, { type: "ignored" })

      expect(result).toBe("no timing")
    })

    it("should work without description", async () => {
      const timings = makeTimings("init")
      const fn = () => "result"

      await time(fn, { type: "nodesc", timings })

      expect(timings.nodesc![0]!.desc).toBeUndefined()
    })

    it("should add multiple timings of same type", async () => {
      const timings = makeTimings("init")

      await time(() => "first", { type: "db", desc: "query1", timings })
      await time(() => "second", { type: "db", desc: "query2", timings })

      expect(timings.db).toHaveLength(2) // 2 db queries
      expect(timings.db![0]).toHaveProperty("desc", "query1")
      expect(timings.db![1]).toHaveProperty("desc", "query2")
    })
  })

  describe("getServerTimeHeader", () => {
    it("should return empty string for undefined timings", () => {
      expect(getServerTimeHeader(undefined)).toBe("")
    })

    it("should format timings with description", () => {
      const timings: Timings = {
        db: [{ desc: "query users", time: 45.6 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toContain("db")
      expect(header).toContain('desc="query users"')
      expect(header).toContain("dur=45.6")
    })

    it("should format timings without description", () => {
      const timings: Timings = {
        api: [{ time: 123.4 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toMatch(/^api;dur=123\.4$/)
    })

    it("should sum multiple timings of same type", () => {
      const timings: Timings = {
        db: [{ time: 10.5 }, { time: 20.3 }, { time: 5.2 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toContain("dur=36.0")
    })

    it("should combine descriptions with '&'", () => {
      const timings: Timings = {
        db: [
          { desc: "query1", time: 10 },
          { desc: "query2", time: 20 },
        ],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toContain('desc="query1 & query2"')
    })

    it("should calculate duration from start time", () => {
      const timings: Timings = {
        pending: [{ start: performance.now() - 100 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toMatch(/pending;dur=\d+\.\d/)
    })

    it("should handle multiple timing types", () => {
      const timings: Timings = {
        db: [{ time: 10 }],
        api: [{ time: 20 }],
        cache: [{ time: 5 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toContain("db;dur=10.0")
      expect(header).toContain("api;dur=20.0")
      expect(header).toContain("cache;dur=5.0")
    })

    it("should sanitize timing names", () => {
      const timings: Timings = {
        "db:query/users@domain=test,val;semicolon\\backslash with spaces": [{ time: 10 }],
      }

      const header = getServerTimeHeader(timings)

      // The timing name itself should be sanitized, but = and ; are used in the format (key;desc=...;dur=...)
      expect(header).toContain("db_query_users_domain_test_val_semicolon_backslash_with_spaces")
      expect(header).not.toContain(":")
      expect(header).not.toContain("/")
      expect(header).not.toContain("@")
      expect(header).not.toContain(",")
      expect(header).not.toContain("\\")
      // Note: = and ; are part of the output format (dur=..., key;desc=...)
    })

    it("should round duration to 1 decimal place", () => {
      const timings: Timings = {
        test: [{ time: 12.3456789 }],
      }

      const header = getServerTimeHeader(timings)

      expect(header).toContain("dur=12.3")
    })
  })

  describe("combineServerTimings", () => {
    it("should combine timing headers from two Headers objects", () => {
      const headers1 = new Headers()
      headers1.set("Server-Timing", "db;dur=10")

      const headers2 = new Headers()
      headers2.set("Server-Timing", "api;dur=20")

      const combined = combineServerTimings(headers1, headers2)

      expect(combined).toBe("db;dur=10, api;dur=20")
    })

    it("should handle empty second header", () => {
      const headers1 = new Headers()
      headers1.set("Server-Timing", "db;dur=10")

      const headers2 = new Headers()

      const combined = combineServerTimings(headers1, headers2)

      expect(combined).toBe("db;dur=10, ")
    })

    it("should handle both headers being empty", () => {
      const headers1 = new Headers()
      const headers2 = new Headers()

      const combined = combineServerTimings(headers1, headers2)

      expect(combined).toBe("")
    })

    it("should preserve first header and append second", () => {
      const headers1 = new Headers()
      headers1.set("Server-Timing", "cache;dur=5, db;dur=10")

      const headers2 = new Headers()
      headers2.set("Server-Timing", "api;dur=20")

      const combined = combineServerTimings(headers1, headers2)

      expect(combined).toBe("cache;dur=5, db;dur=10, api;dur=20")
    })
  })
})
