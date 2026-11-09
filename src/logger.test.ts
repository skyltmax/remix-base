import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Writable } from "node:stream"
import express from "express"
import type pino from "pino"
import { afterEach, describe, expect, it, vi } from "vitest"
import { expressLogger } from "./logger.js"

const lines = vi.hoisted(() => [] as Record<string, unknown>[])

// Route the module logger into an in-memory stream so the access lines can be inspected.
vi.mock("pino", async importOriginal => {
  const actual = await importOriginal<{ default: typeof pino }>()
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)))
      callback()
    },
  })
  const createLogger = Object.assign((opts: pino.LoggerOptions) => actual.default(opts, stream), actual.default)
  return { ...actual, default: createLogger }
})

describe("expressLogger", () => {
  let server: Server | undefined

  afterEach(async () => {
    lines.length = 0
    await new Promise(resolve => server?.close(resolve))
    server = undefined
  })

  async function requestCompletedLine(handler: express.RequestHandler) {
    const app = express()
    app.use(expressLogger)
    app.get("/", handler)
    server = app.listen(0)
    await new Promise(resolve => server!.once("listening", resolve))

    await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)).text()

    await vi.waitFor(() => expect(lines.find(line => line.msg === "request completed")).toBeDefined())
    return lines.find(line => line.msg === "request completed")!
  }

  it("merges res.locals.log into the request completed line", async () => {
    const line = await requestCompletedLine((req, res) => {
      res.locals.log = { stack: "rails", upstream_ms: 12.3 }
      res.send("ok")
    })

    expect(line).toMatchObject({ stack: "rails", upstream_ms: 12.3, res: { statusCode: 200 } })
  })

  it("leaves the line unchanged without res.locals.log", async () => {
    const line = await requestCompletedLine((req, res) => {
      res.send("ok")
    })

    expect(Object.keys(line).sort()).toEqual(["hostname", "level", "msg", "pid", "req", "res", "responseTime", "time"])
  })
})
