import { GrowthBookClient, setPolyfills, type UserScopedGrowthBook, type Attributes } from "@growthbook/growthbook"
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
  forcedFeatures?: Map<string, unknown>
  deviceId?: string
}

export const createScopedGrowthBook = (
  request: express.Request,
  client: GrowthBookClient,
  options?: ScopedGrowthbookOptions
) => {
  const userAgent = request.headers["user-agent"] || ""
  const bot = isbot(userAgent)

  const gbInstance = client.createScopedInstance({
    attributes: {
      url: request.url,
      path: request.path,
      host: request.headers["host"],
      deviceType: BrowserDetection.mobile(userAgent) ? "mobile" : "desktop",
      browser: BrowserDetection.browser(userAgent),
      bot,
      deviceId: options?.deviceId,
    },
  })

  if (options?.forcedFeatures) {
    gbInstance.setForcedFeatures(options.forcedFeatures)
  }

  if (options?.attributes) {
    gbInstance.updateAttributes(options.attributes)
  }

  return gbInstance
}

export const growthbookContext = createContext<UserScopedGrowthBook | undefined>()
