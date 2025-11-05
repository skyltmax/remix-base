import pino from "pino"
import { beforeEach, describe, expect, it } from "vitest"
import { CloudfrontIpUpdater } from "./updater"

describe("Cloudfront IP updater", () => {
  let service: CloudfrontIpUpdater

  beforeEach(() => {
    const logger = pino({ enabled: false })
    service = new CloudfrontIpUpdater(logger)
  })

  describe("getJSON", () => {
    it("should return successfully", async () => {
      // override private
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const actual = await service.getJSON()
      return expect(actual.prefixes[0]?.ip_prefix).toBeTruthy()
    })
  })

  describe("getIpRange", () => {
    it("should return successfully", async () => {
      const actual = await service.getIpRange()
      return expect(actual[0]).toBeTruthy()
    })
  })
})
