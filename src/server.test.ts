import { type RequestHandler } from "express"
import getPort, { clearLockedPorts } from "get-port"
import { type ServerBuild } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { serveApp, type ServeAppHandle } from "./server.js"

// Never invoked: every request in these tests is answered before the React Router handler.
const build = async () => ({}) as ServerBuild

const html = `<!doctype html><p>${"x".repeat(2048)}</p>`

const answerHtml: RequestHandler = (req, res) => {
  res.type("html").send(html)
}

describe("serveApp", () => {
  let handle: ServeAppHandle | undefined

  afterEach(async () => {
    await handle?.close()
    handle = undefined
  })

  async function start(options: Parameters<typeof serveApp>[1]) {
    const port = await getPort()
    // get-port locks the ports it returns, so serveApp's own availability check would otherwise reject this one.
    clearLockedPorts()
    handle = await serveApp(build, { trustProxy: false, port, ...options })
    return (path: string, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${handle!.port}${path}`, { headers: { "Accept-Encoding": "gzip", ...headers } })
  }

  const echoClient: RequestHandler = (req, res) => {
    res.json({ ip: req.ip, protocol: req.protocol })
  }

  const forwarded = { "X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "https" }
  const direct = { ip: expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$/), protocol: "http" }
  const visitor = { ip: "203.0.113.7", protocol: "https" }

  it("runs preMiddleware before compression", async () => {
    const get = await start({ preMiddleware: [answerHtml] })

    const res = await get("/")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-encoding")).toBeNull()
    expect(res.headers.get("vary")).toBeNull()
    expect(await res.text()).toBe(html)
  })

  it("runs middleware after compression", async () => {
    const get = await start({ middleware: [answerHtml] })

    const res = await get("/")

    expect(res.headers.get("content-encoding")).toBe("gzip")
    expect(res.headers.get("vary")).toBe("Accept-Encoding")
    expect(await res.text()).toBe(html)
  })

  it("falls through to the regular stack when preMiddleware calls next()", async () => {
    const seen: string[] = []
    const get = await start({
      preMiddleware: [
        (req, res, next) => {
          seen.push(req.path)
          next()
        },
      ],
      middleware: [answerHtml],
    })

    const res = await get("/page")

    expect(seen).toEqual(["/page"])
    expect(res.headers.get("content-encoding")).toBe("gzip")
    expect(await res.text()).toBe(html)
  })

  it("runs preMiddleware after the access logger", async () => {
    const get = await start({ preMiddleware: [answerHtml] })

    const res = await get("/")

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
  })

  describe("proxy trust", () => {
    it("trusts loopback, link-local and unique-local proxies by default", async () => {
      const get = await start({ trustProxy: undefined, preMiddleware: [echoClient] })

      const res = await get("/", forwarded)

      expect(await res.json()).toEqual(visitor)
    })

    it("ignores forwarding headers with trustProxy: false", async () => {
      const get = await start({ trustProxy: false, preMiddleware: [echoClient] })

      const res = await get("/", forwarded)

      expect(await res.json()).toEqual(direct)
    })

    it("applies a custom trustProxy list", async () => {
      const get = await start({ trustProxy: ["uniquelocal"], preMiddleware: [echoClient] })

      const res = await get("/", forwarded)

      expect(await res.json()).toEqual(direct)
    })
  })
})
