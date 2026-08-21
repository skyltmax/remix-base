import {
  GrowthBookClient,
  setPolyfills,
  type UserScopedGrowthBook,
  type Attributes,
  type StickyBucketService,
  type UserContext,
} from "@growthbook/growthbook"
import { EventSource } from "eventsource"
import type * as express from "express"
import { isbot } from "isbot"
import { createContext } from "react-router"
import logger from "./logger.js"
import { BrowserDetection } from "./util/browser_detection.js"

setPolyfills({
  EventSource,
})

export interface GrowthBookConfig {
  apiHost: string
  clientKey: string
  timeout?: number
  streaming?: boolean
}

export const createGrowthBook = async (config: GrowthBookConfig) => {
  const growthbook = new GrowthBookClient({
    apiHost: config.apiHost,
    clientKey: config.clientKey,
    log: logger.info,
  })

  await growthbook.init({
    timeout: config.timeout ?? 3000,
    streaming: config.streaming ?? true,
  })

  return growthbook
}

export interface ScopedGrowthbookOptions {
  attributes?: Attributes
  forcedFeatures?: Map<string, unknown> | null
  deviceId?: string | null
  stickyBucketService?: StickyBucketService
}

export const createScopedGrowthBook = async (
  request: express.Request,
  client: GrowthBookClient,
  options?: ScopedGrowthbookOptions
): Promise<UserScopedGrowthBook> => {
  const userAgent = request.headers["user-agent"] || ""
  const bot = isbot(userAgent)

  const attributes: Attributes = {
    url: request.url,
    path: request.path,
    host: request.headers["host"],
    deviceType: BrowserDetection.mobile(userAgent) ? "mobile" : "desktop",
    browser: BrowserDetection.browser(userAgent),
    bot,
    deviceId: options?.deviceId,
    ...options?.attributes,
  }

  let userContext: UserContext = { attributes }

  if (options?.stickyBucketService && !bot) {
    try {
      userContext = await client.applyStickyBuckets(userContext, options.stickyBucketService)
    } catch (error) {
      logger.error(error, "Failed to apply GrowthBook sticky buckets")
    }
  }

  const gbInstance = client.createScopedInstance(userContext)

  if (options?.forcedFeatures) {
    gbInstance.setForcedFeatures(options.forcedFeatures)
  }

  return gbInstance
}

// Re-applies sticky buckets after identity attributes arrive mid-request (e.g. updateAttributes({ adminId })).
export const refreshStickyBuckets = async (
  gbInstance: UserScopedGrowthBook,
  client: GrowthBookClient,
  stickyBucketService: StickyBucketService
): Promise<void> => {
  const userContext = gbInstance.getUserContext()
  if (userContext.attributes?.bot) return

  try {
    const refreshed = await client.applyStickyBuckets(userContext, stickyBucketService)
    userContext.stickyBucketAssignmentDocs = refreshed.stickyBucketAssignmentDocs
    userContext.saveStickyBucketAssignmentDoc = refreshed.saveStickyBucketAssignmentDoc
  } catch (error) {
    logger.error(error, "Failed to refresh GrowthBook sticky buckets")
  }
}

// eslint-disable-next-line @eslint-react/naming-convention-context-name
export const growthbookContext = createContext<UserScopedGrowthBook | undefined>()
