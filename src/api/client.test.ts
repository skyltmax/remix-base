import { gql } from "graphql-request"
import { HttpResponse } from "msw"
import { setupServer } from "msw/node"
import httpMocks from "node-mocks-http"
import pino from "pino"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
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
  })
})
