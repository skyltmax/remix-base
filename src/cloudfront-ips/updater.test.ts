import { type Application } from "express"
import pino from "pino"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CloudfrontIpUpdater } from "./updater"

// Mock data
const mockValidResponse = {
  prefixes: [
    { ip_prefix: "1.2.3.0/24", region: "us-east-1", service: "CLOUDFRONT" },
    { ip_prefix: "4.5.6.0/24", region: "us-west-2", service: "CLOUDFRONT" },
    { ip_prefix: "7.8.9.0/24", region: "eu-west-1", service: "ROUTE53" },
  ],
  ipv6_prefixes: [
    { ipv6_prefix: "2001:db8::/32", region: "us-east-1", service: "CLOUDFRONT" },
    { ipv6_prefix: "2001:db9::/32", region: "us-west-2", service: "ROUTE53" },
  ],
}

describe("Cloudfront IP updater", () => {
  let service: CloudfrontIpUpdater

  beforeEach(() => {
    vi.clearAllMocks()
    const logger = pino({ enabled: false })
    service = new CloudfrontIpUpdater(logger)
  })

  describe("getIpRange", () => {
    it("should return successfully and filter IPs", async () => {
      // Mock getJSON to avoid network calls
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      service.getJSON = vi.fn().mockResolvedValue(mockValidResponse)

      const actual = await service.getIpRange()
      expect(actual).toContain("1.2.3.0/24")
      expect(actual).toContain("2001:db8::/32")
      expect(actual.length).toBeGreaterThan(0)
    })

    it("should filter by service name", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      service.getJSON = vi.fn().mockResolvedValue(mockValidResponse)

      const cloudFrontIps = await service.getIpRange("CLOUDFRONT")
      const route53Ips = await service.getIpRange("ROUTE53")

      expect(cloudFrontIps).toContain("1.2.3.0/24")
      expect(cloudFrontIps).toContain("2001:db8::/32")
      expect(cloudFrontIps).not.toContain("7.8.9.0/24")

      expect(route53Ips).toContain("7.8.9.0/24")
      expect(route53Ips).toContain("2001:db9::/32")
      expect(route53Ips).not.toContain("1.2.3.0/24")
    })
  })

  describe("updateTrustProxy", () => {
    it("should update express app trust proxy setting", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      service.getJSON = vi.fn().mockResolvedValue(mockValidResponse)

      const app = {
        set: vi.fn(),
      } as unknown as Application

      await service.updateTrustProxy(app)

      expect(app.set).toHaveBeenCalledWith(
        "trust proxy",
        expect.arrayContaining(["loopback", "linklocal", "uniquelocal"])
      )
      expect(app.set).toHaveBeenCalledTimes(2) // Once initially, once after successful fetch
    })

    it("should throw error when getIpRange fails", async () => {
      const logError = vi.fn()
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: logError,
        debug: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        silent: vi.fn(),
        child: vi.fn(),
      } as unknown as pino.Logger

      const invalidService = new CloudfrontIpUpdater(logger)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      invalidService.getJSON = vi.fn().mockRejectedValue(new Error("Network failure"))

      const app = {
        set: vi.fn(),
      } as unknown as Application

      await expect(invalidService.updateTrustProxy(app)).rejects.toThrow()
      expect(logError).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("Failed to fetch CloudFront IP ranges")
      )
    })

    it("should warn and return when IP range is empty", async () => {
      const logWarn = vi.fn()
      const logger = {
        info: vi.fn(),
        warn: logWarn,
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        silent: vi.fn(),
        child: vi.fn(),
      } as unknown as pino.Logger

      const testService = new CloudfrontIpUpdater(logger)
      const app = {
        set: vi.fn(),
      } as unknown as Application

      // Mock getIpRange to return empty array
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      testService.getIpRange = vi.fn().mockResolvedValue([])

      await testService.updateTrustProxy(app)

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("empty CloudFront IP range"))
      expect(app.set).toHaveBeenCalledTimes(1) // Only initial call, not updated
    })
  })
})
