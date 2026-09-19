import { HttpResponse } from "msw"
import { setupServer } from "msw/node"
import httpMocks from "node-mocks-http"
import pino from "pino"
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { gqlOpHandler } from "../test/helpers.js"
import { deviceKeyMiddleware, isBotRequest } from "./device_key.js"

vi.mock("crypto", () => ({ randomUUID: vi.fn(() => "mocked-mocked-mocked-mocked-mocked") }))

const handlers = [gqlOpHandler("AdminState", HttpResponse.json({ data: { currentAdmin: { id: "4" } } }))]

describe("deviceKeyMiddleware", () => {
  const server = setupServer(...handlers)
  const middleware = deviceKeyMiddleware({ cookieName: "sm_device_key" })

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "warn" })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  it("should generate a new deviceKey if not present in cookies", async () => {
    const request = httpMocks.createRequest({ log: pino({ enabled: false }) })
    const response = httpMocks.createResponse()

    const spy = vi.spyOn(response, "cookie")
    const next = vi.fn()

    await middleware(request, response, next)

    expect(spy).toHaveBeenCalledWith("sm_device_key", "mocked-mocked-mocked-mocked-mocked", {
      maxAge: 1000 * 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "lax",
    })
    expect(request.headers.cookie).toBe("sm_device_key=mocked-mocked-mocked-mocked-mocked")
    expect(response.cookies.sm_device_key).toStrictEqual({
      value: "mocked-mocked-mocked-mocked-mocked",
      options: {
        maxAge: 1000 * 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: "lax",
      },
    })
  })

  it("should use existing deviceKey if present in cookies", async () => {
    const request = httpMocks.createRequest({
      ip: "127.0.0.1",
      cookies: { sm_device_key: "existing-device-key" },
      headers: { cookie: "sm_device_key=existing-device-key" },
      log: pino({ enabled: false }),
    })

    const response = httpMocks.createResponse()

    const spy = vi.spyOn(response, "cookie")
    const next = vi.fn()

    await middleware(request, response, next)

    expect(spy).not.toHaveBeenCalledWith("sm_device_key", "mocked-mocked-mocked-mocked-mocked", expect.any(Object))
    expect(request.headers.cookie).toContain("sm_device_key=existing-device-key")
  })

  describe("with a skip predicate", () => {
    it("should not mint a key or set a cookie when skip returns true", async () => {
      const skipping = deviceKeyMiddleware({ cookieName: "sm_device_key", skip: () => true })
      const request = httpMocks.createRequest({ log: pino({ enabled: false }) })
      const response = httpMocks.createResponse()

      const spy = vi.spyOn(response, "cookie")
      const next = vi.fn()

      await skipping(request, response, next)

      expect(spy).not.toHaveBeenCalled()
      expect(request.headers.cookie).toBeUndefined()
      expect(request.cookies.sm_device_key).toBeUndefined()
      expect(response.cookies.sm_device_key).toBeUndefined()
      expect(next).toHaveBeenCalledOnce()
    })

    it("should leave an existing key untouched when skip returns true", async () => {
      const skipping = deviceKeyMiddleware({ cookieName: "sm_device_key", skip: () => true })
      const request = httpMocks.createRequest({
        cookies: { sm_device_key: "existing-device-key" },
        headers: { cookie: "sm_device_key=existing-device-key" },
        log: pino({ enabled: false }),
      })
      const response = httpMocks.createResponse()

      const spy = vi.spyOn(response, "cookie")
      const next = vi.fn()

      await skipping(request, response, next)

      expect(spy).not.toHaveBeenCalled()
      expect(request.headers.cookie).toBe("sm_device_key=existing-device-key")
      expect(request.cookies.sm_device_key).toBe("existing-device-key")
      expect(next).toHaveBeenCalledOnce()
    })

    it("should mint as usual when skip returns false", async () => {
      const skipping = deviceKeyMiddleware({ cookieName: "sm_device_key", skip: () => false })
      const request = httpMocks.createRequest({ log: pino({ enabled: false }) })
      const response = httpMocks.createResponse()

      const spy = vi.spyOn(response, "cookie")
      const next = vi.fn()

      await skipping(request, response, next)

      expect(spy).toHaveBeenCalledWith("sm_device_key", "mocked-mocked-mocked-mocked-mocked", {
        maxAge: 1000 * 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: "lax",
      })
      expect(request.headers.cookie).toBe("sm_device_key=mocked-mocked-mocked-mocked-mocked")
      expect(next).toHaveBeenCalledOnce()
    })

    it("should pass the request to the skip predicate", async () => {
      const skip = vi.fn(() => false)
      const skipping = deviceKeyMiddleware({ cookieName: "sm_device_key", skip })
      const request = httpMocks.createRequest({
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        log: pino({ enabled: false }),
      })
      const response = httpMocks.createResponse()

      await skipping(request, response, vi.fn())

      expect(skip).toHaveBeenCalledWith(request)
    })

    it("should skip bot traffic when composed with isBotRequest", async () => {
      const skipping = deviceKeyMiddleware({ cookieName: "sm_device_key", skip: isBotRequest })
      const request = httpMocks.createRequest({
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        log: pino({ enabled: false }),
      })
      const response = httpMocks.createResponse()

      const spy = vi.spyOn(response, "cookie")

      await skipping(request, response, vi.fn())

      expect(spy).not.toHaveBeenCalled()
      expect(request.headers.cookie).toBeUndefined()
    })
  })
})
