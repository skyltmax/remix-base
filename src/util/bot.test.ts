import httpMocks from "node-mocks-http"
import { describe, it, expect } from "vitest"
import { isBotRequest } from "./bot.js"

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

describe("isBotRequest", () => {
  it("should detect a crawler user agent", () => {
    const request = httpMocks.createRequest({ headers: { "user-agent": GOOGLEBOT } })

    expect(isBotRequest(request)).toBe(true)
  })

  it("should not flag a browser user agent", () => {
    const request = httpMocks.createRequest({ headers: { "user-agent": CHROME } })

    expect(isBotRequest(request)).toBe(false)
  })

  it("should return false when the user agent header is missing", () => {
    const request = httpMocks.createRequest()

    expect(isBotRequest(request)).toBe(false)
  })
})
