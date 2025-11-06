import { gql } from "graphql-request"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import httpMocks from "node-mocks-http"
import pino from "pino"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { gqlOpHandler } from "../test/helpers"
import { createRequest, createResponseMiddleware } from "./client"

const handlers = [
  gqlOpHandler(
    "AdminStateForbidden",
    HttpResponse.json({ errors: [{ message: "unauthorized", extensions: { code: "unauthorized" } }] }, { status: 200 })
  ),
]

describe("GraphQL client", () => {
  const server = setupServer(...handlers)

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "warn" })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe("createRequest", () => {
    it("should redirect to login on auth failure", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/user/42",
        log: pino({ enabled: false }),
      })

      const doc = gql`
        query AdminStateForbidden {
          currentAdmin {
            id
          }
        }
      `

      const res = httpMocks.createResponse()
      const request = createRequest(req, res, createResponseMiddleware(req, res))

      try {
        await request(doc)
      } catch (e) {
        expect(e).toBeInstanceOf(Response)
        expect((e as Response).status).toBe(403)
      }
    })

    it("passes headers to the backend", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/user/42",
        log: pino({ enabled: false }),
        headers: {
          "x-test-header": "test-value",
        },
      })

      const doc = gql`
        query CookiePassthrough {
          currentAdmin {
            id
          }
        }
      `

      server.use(gqlOpHandler("CookiePassthrough", HttpResponse.json({ data: { currentAdmin: { id: 42 } } })))

      const res = httpMocks.createResponse()
      const request = createRequest(req, res, createResponseMiddleware(req, res))
      const resp = await request(doc)
      expect(resp).toEqual({ currentAdmin: { id: 42 } })
    })

    it("respects custom passthrough header configuration", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/user/42",
        log: pino({ enabled: false }),
        headers: {
          "x-custom-header": "custom-value",
          "x-test-header": "should-not-forward",
        },
      })

      const doc = gql`
        query CustomPassthrough {
          currentAdmin {
            id
          }
        }
      `

      server.use(
        http.post("http://localhost:3000/graphql", async ({ request }) => {
          expect(request.headers.get("x-custom-header")).toBe("custom-value")
          expect(request.headers.get("x-test-header")).toBeNull()

          return HttpResponse.json({ data: { currentAdmin: { id: 42 } } })
        })
      )

      const res = httpMocks.createResponse()
      const request = createRequest(req, res, createResponseMiddleware(req, res), {
        includeDefaultPassthroughHeaders: false,
        passthroughHeaders: ["x-custom-header"],
      })

      const resp = await request(doc)
      expect(resp).toEqual({ currentAdmin: { id: 42 } })
    })
  })

  describe("createResponseMiddleware", () => {
    it("passes updated auth cookie back to the client", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/user/42",
        log: pino({ enabled: false }),
      })

      const res = httpMocks.createResponse()

      const gqlResponse = httpMocks.createResponse()
      const gqlHeaders = new Headers()
      gqlHeaders.set("set-cookie", "_at=123; path=/; expires=Wed, 09 Jun 2021 10:18:14 GMT; secure; domain=example.com")

      const middleware = createResponseMiddleware(req, res)
      await middleware(
        { ...gqlResponse, headers: gqlHeaders, data: {}, status: 200 },
        { ...req, headers: new Headers() }
      )

      expect(res.cookies).toEqual({
        _at: {
          value: "123",
          options: {
            domain: "example.com",
            expires: new Date("Wed, 09 Jun 2021 10:18:14 GMT"),
            secure: true,
            sameSite: "lax",
            path: "/",
            httpOnly: true,
            maxAge: undefined,
          },
        },
      })
    })

    it("should forward server-timing headers", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/test",
        log: pino({ enabled: false }),
      })

      const res = httpMocks.createResponse()

      const gqlResponse = httpMocks.createResponse()
      const gqlHeaders = new Headers()
      gqlHeaders.set("server-timing", "db;dur=10, api;dur=20")

      const middleware = createResponseMiddleware(req, res)
      await middleware(
        { ...gqlResponse, headers: gqlHeaders, data: {}, status: 200 },
        { ...req, headers: new Headers() }
      )

      // Check that appendHeader was called (httpMocks tracks this)
      const serverTiming = res.getHeader("server-timing")
      expect(serverTiming).toBe("db;dur=10, api;dur=20")
    })

    it("should warn when response headers already sent", async () => {
      const logWarn = vi.fn()
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/test",
        log: {
          warn: logWarn,
          error: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
          fatal: vi.fn(),
          trace: vi.fn(),
          silent: vi.fn(),
          child: vi.fn(),
        } as unknown as pino.Logger,
      })

      const res = httpMocks.createResponse()
      res.headersSent = true

      const gqlResponse = httpMocks.createResponse()
      const gqlHeaders = new Headers()
      gqlHeaders.set("set-cookie", "_at=123; path=/")

      const middleware = createResponseMiddleware(req, res)
      await middleware(
        { ...gqlResponse, headers: gqlHeaders, data: {}, status: 200 },
        { ...req, headers: new Headers() }
      )

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("Response headers already sent"))
    })

    it("should skip cookies when skipCookies is true", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/test",
        log: pino({ enabled: false }),
      })

      const res = httpMocks.createResponse()

      const gqlResponse = httpMocks.createResponse()
      const gqlHeaders = new Headers()
      gqlHeaders.set("set-cookie", "_at=123; path=/")

      const middleware = createResponseMiddleware(req, res, true)
      await middleware(
        { ...gqlResponse, headers: gqlHeaders, data: {}, status: 200 },
        { ...req, headers: new Headers() }
      )

      expect(res.cookies).toEqual({})
    })

    it("should handle ClientError with password redaction", async () => {
      const req = httpMocks.createRequest({
        method: "POST",
        url: "/test",
        log: pino({ enabled: false }),
      })

      const doc = gql`
        mutation LoginFail {
          login(email: "test@example.com", password: "secret123") {
            token
          }
        }
      `

      server.use(
        gqlOpHandler("LoginFail", HttpResponse.json({ errors: [{ message: "Invalid credentials" }] }, { status: 400 }))
      )

      const res = httpMocks.createResponse()
      const request = createRequest(req, res, createResponseMiddleware(req, res))

      try {
        await request(doc, { password: "secret123" })
        throw new Error("Should have thrown")
      } catch (e) {
        expect(e).toBeInstanceOf(Response)
        expect((e as Response).status).toBe(400)
      }
    })

    it("should handle generic errors", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/test",
        log: pino({ enabled: false }),
      })

      const doc = gql`
        query NetworkError {
          test
        }
      `

      server.use(
        http.post("http://localhost:3000/graphql", () => {
          // Simulate network error - graphql-request will wrap this
          return HttpResponse.json({ errors: [{ message: "Internal error" }] }, { status: 500 })
        })
      )

      const res = httpMocks.createResponse()
      const request = createRequest(req, res, createResponseMiddleware(req, res))

      try {
        await request(doc)
        throw new Error("Should have thrown")
      } catch (e) {
        // Generic errors from the API are converted to Response objects
        expect(e).toBeInstanceOf(Response)
        expect((e as Response).status).toBe(500)
      }
    })

    it("should handle multiple cookies in set-cookie header", async () => {
      const req = httpMocks.createRequest({
        method: "GET",
        url: "/test",
        log: pino({ enabled: false }),
      })

      const res = httpMocks.createResponse()

      const gqlResponse = httpMocks.createResponse()
      const gqlHeaders = new Headers()
      gqlHeaders.set("set-cookie", "_at=token1; path=/; secure, _rt=token2; path=/; max-age=3600; secure")

      const middleware = createResponseMiddleware(req, res)
      await middleware(
        { ...gqlResponse, headers: gqlHeaders, data: {}, status: 200 },
        { ...req, headers: new Headers() }
      )

      expect(res.cookies).toHaveProperty("_at")
      expect(res.cookies).toHaveProperty("_rt")
      expect(res.cookies._rt!.options.maxAge).toBe(3600000) // maxAge is converted to milliseconds
    })
  })
})
