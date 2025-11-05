import type { GrowthBookClient, UserScopedGrowthBook } from "@growthbook/growthbook"
import * as Sentry from "@sentry/node"
import type * as express from "express"
import { isbot } from "isbot"
import { type Logger } from "pino"
import type { RequestFunc } from "./api/client"
import BrowserDetection from "./util/browser_detection"
import { getRevision } from "./util/revision"

export interface LoadContext {
  revision?: string
  nodeEnv?: string
  request: RequestFunc
  log: Logger
  growthbook?: UserScopedGrowthBook
  ip?: string
  cspNonce: string
}

declare module "http" {
  interface IncomingMessage {
    request: RequestFunc
  }
}

const REVISION = getRevision()

export interface GetLoadContextOptions {
  growthbook?: GrowthBookClient
  deviceKeyCookieName?: string
}

export const getLoadContext = (
  request: express.Request,
  response: express.Response,
  options?: GetLoadContextOptions
): LoadContext => {
  Sentry.setUser({ ip_address: request.ip })

  const deviceKeyCookieName = options?.deviceKeyCookieName || "device_key"
  const deviceKey = request.cookies[deviceKeyCookieName]

  let gbInstance: UserScopedGrowthBook | undefined

  if (options?.growthbook) {
    const userAgent = request.headers["user-agent"] || ""
    const bot = isbot(userAgent)

    gbInstance = options.growthbook.createScopedInstance({
      attributes: {
        url: request.url,
        path: request.path,
        host: request.headers.host,
        deviceType: BrowserDetection.mobile(userAgent) ? "mobile" : "desktop",
        browser: BrowserDetection.browser(userAgent),
        bot,
        deviceId: deviceKey,
      },
    })
  }

  return {
    revision: REVISION,
    nodeEnv: process.env.NODE_ENV,
    request: request.request,
    log: request.log,
    growthbook: gbInstance,
    ip: request.ip,
    cspNonce: response.locals.cspNonce,
  }
}
