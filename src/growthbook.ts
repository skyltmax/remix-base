import { GrowthBookClient, setPolyfills } from "@growthbook/growthbook"
import { EventSource } from "eventsource"
import logger from "./logger"

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
