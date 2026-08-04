import {
  GrowthBookClient,
  StickyBucketService,
  type FeatureApiResponse,
  type StickyAssignmentsDocument,
} from "@growthbook/growthbook"
import httpMocks from "node-mocks-http"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createScopedGrowthBook, refreshStickyBuckets } from "./growthbook.js"
import logger from "./logger.js"

// Mock the logger
vi.mock("./logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"

const createRequest = (userAgent: string = CHROME_UA) =>
  httpMocks.createRequest({
    method: "GET",
    url: "/products?ref=email",
    headers: { host: "example.com", "user-agent": userAgent },
  })

// Experiment-backed features with weights [1, 0]: hash-based assignment always picks
// variation 0 ("control"), so a sticky assignment to variation 1 ("treatment") is
// distinguishable from hash assignment.
const experimentFeature = (key: string, hashAttribute: string) => ({
  defaultValue: "off",
  rules: [
    {
      key,
      variations: ["control", "treatment"],
      weights: [1, 0],
      coverage: 1,
      hashAttribute,
      meta: [{ key: "0" }, { key: "1" }],
    },
  ],
})

const payload: FeatureApiResponse = {
  features: {
    "device-feature": experimentFeature("device-exp", "deviceId"),
    "locale-feature": experimentFeature("locale-exp", "locale"),
    "admin-feature": experimentFeature("admin-exp", "adminId"),
  },
}

const createClient = () => new GrowthBookClient().initSync({ payload })

class MapStickyBucketService extends StickyBucketService {
  store = new Map<string, StickyAssignmentsDocument>()

  async getAssignments(attributeName: string, attributeValue: string): Promise<StickyAssignmentsDocument | null> {
    return this.store.get(`${attributeName}||${attributeValue}`) ?? null
  }

  async saveAssignments(doc: StickyAssignmentsDocument): Promise<unknown> {
    return this.store.set(`${doc.attributeName}||${doc.attributeValue}`, doc)
  }
}

class FailingStickyBucketService extends StickyBucketService {
  async getAssignments(): Promise<StickyAssignmentsDocument | null> {
    throw new Error("sticky bucket store down")
  }

  async saveAssignments(): Promise<unknown> {
    throw new Error("sticky bucket store down")
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createScopedGrowthBook", () => {
  it("returns a promise", () => {
    const result = createScopedGrowthBook(createRequest(), createClient())

    expect(result).toBeInstanceOf(Promise)
  })

  it("builds attributes from the request and merges options.attributes", async () => {
    const gbInstance = await createScopedGrowthBook(createRequest(), createClient(), {
      deviceId: "device-123",
      attributes: { locale: "sv" },
    })

    expect(gbInstance.getUserContext().attributes).toMatchObject({
      url: "/products?ref=email",
      path: "/products",
      host: "example.com",
      deviceType: "desktop",
      browser: "chrome",
      bot: false,
      deviceId: "device-123",
      locale: "sv",
    })
  })

  it("applies forced features", async () => {
    const gbInstance = await createScopedGrowthBook(createRequest(), createClient(), {
      forcedFeatures: new Map([["device-feature", "forced"]]),
    })

    expect(gbInstance.getFeatureValue("device-feature", "off")).toBe("forced")
  })

  it("assigns experiments by hash when no sticky bucket service is given", async () => {
    const gbInstance = await createScopedGrowthBook(createRequest(), createClient(), {
      deviceId: "device-123",
    })

    expect(gbInstance.getFeatureValue("device-feature", "off")).toBe("control")
  })

  it("passes merged attributes to the sticky bucket service", async () => {
    const service = new MapStickyBucketService()
    const getAllAssignments = vi.spyOn(service, "getAllAssignments")

    await createScopedGrowthBook(createRequest(), createClient(), {
      deviceId: "device-123",
      attributes: { locale: "sv" },
      stickyBucketService: service,
    })

    expect(getAllAssignments).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "device-123", locale: "sv" }))
  })

  it("honors a pre-seeded sticky assignment over hash assignment", async () => {
    const service = new MapStickyBucketService()
    await service.saveAssignments({
      attributeName: "deviceId",
      attributeValue: "device-123",
      assignments: { "device-exp__0": "1" },
    })

    const gbInstance = await createScopedGrowthBook(createRequest(), createClient(), {
      deviceId: "device-123",
      stickyBucketService: service,
    })

    expect(gbInstance.getFeatureValue("device-feature", "off")).toBe("treatment")
  })

  it("fails open when the sticky bucket service rejects", async () => {
    const gbInstance = await createScopedGrowthBook(createRequest(), createClient(), {
      deviceId: "device-123",
      stickyBucketService: new FailingStickyBucketService(),
    })

    expect(gbInstance.getFeatureValue("device-feature", "off")).toBe("control")
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), "Failed to apply GrowthBook sticky buckets")
  })

  it("never touches the sticky bucket service for bots", async () => {
    const service = new MapStickyBucketService()
    const getAllAssignments = vi.spyOn(service, "getAllAssignments")

    const gbInstance = await createScopedGrowthBook(createRequest(BOT_UA), createClient(), {
      stickyBucketService: service,
    })

    expect(getAllAssignments).not.toHaveBeenCalled()
    expect(gbInstance.getUserContext().attributes?.bot).toBe(true)
  })
})

describe("refreshStickyBuckets", () => {
  it("loads sticky assignments for attributes that arrive mid-request", async () => {
    const client = createClient()
    const service = new MapStickyBucketService()
    await service.saveAssignments({
      attributeName: "adminId",
      attributeValue: "admin-1",
      assignments: { "admin-exp__0": "1" },
    })

    const gbInstance = await createScopedGrowthBook(createRequest(), client, {
      deviceId: "device-123",
      stickyBucketService: service,
    })
    expect(gbInstance.getFeatureValue("admin-feature", "off")).toBe("off")

    gbInstance.updateAttributes({ adminId: "admin-1" })
    await refreshStickyBuckets(gbInstance, client, service)

    expect(gbInstance.getFeatureValue("admin-feature", "off")).toBe("treatment")
  })

  it("fails open when the sticky bucket service rejects", async () => {
    const client = createClient()
    const gbInstance = await createScopedGrowthBook(createRequest(), client, {
      deviceId: "device-123",
    })

    await expect(refreshStickyBuckets(gbInstance, client, new FailingStickyBucketService())).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), "Failed to refresh GrowthBook sticky buckets")
  })

  it("is a no-op for bots", async () => {
    const client = createClient()
    const service = new MapStickyBucketService()
    const getAllAssignments = vi.spyOn(service, "getAllAssignments")

    const gbInstance = await createScopedGrowthBook(createRequest(BOT_UA), client)
    await refreshStickyBuckets(gbInstance, client, service)

    expect(getAllAssignments).not.toHaveBeenCalled()
  })
})
