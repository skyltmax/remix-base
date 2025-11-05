import { HttpResponse } from "msw"
import { setupServer } from "msw/node"
import httpMocks from "node-mocks-http"
import pino from "pino"
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { gqlOpHandler } from "../test/helpers"
import { deviceKeyMiddleware } from "./device_key"

vi.mock("crypto", () => ({ randomUUID: vi.fn(() => "mocked-mocked-mocked-mocked-mocked") }))

const handlers = [gqlOpHandler("AdminState", HttpResponse.json({ data: { currentAdmin: { id: "4" } } }))]

describe("adminMiddleware", () => {
  const server = setupServer(...handlers)

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

    await deviceKeyMiddleware(request, response, next)

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

    await deviceKeyMiddleware(request, response, next)

    expect(spy).not.toHaveBeenCalledWith("sm_device_key", "mocked-mocked-mocked-mocked-mocked", expect.any(Object))
    expect(request.headers.cookie).toContain("sm_device_key=existing-device-key")
  })
})
