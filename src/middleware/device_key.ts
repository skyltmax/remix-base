import { randomUUID } from "crypto"
import { type Request, type RequestHandler } from "express"

export { isBotRequest } from "../util/bot.js"

const HOUR = 1000 * 60 * 60

export interface DeviceKeyMiddlewareOptions {
  cookieName?: string
  maxAge?: number
  /** Do nothing if this returns true */
  skip?: (req: Request) => boolean
}

// set a device key cookie to use as anonymous identifier if it doesn't exist
export const deviceKeyMiddleware = (options?: DeviceKeyMiddlewareOptions): RequestHandler => {
  const cookieName = options?.cookieName || "device_key"
  const maxAge = options?.maxAge || HOUR * 24 * 365

  return async (req, res, next) => {
    if (options?.skip?.(req)) {
      return next()
    }

    let deviceKey = req.cookies[cookieName]

    if (!deviceKey) {
      deviceKey = randomUUID()

      req.headers["cookie"] = [req.headers["cookie"], `${cookieName}=${deviceKey}`].filter(Boolean).join("; ")
      res.cookie(cookieName, deviceKey, {
        maxAge,
        httpOnly: true,
        sameSite: "lax",
      })
    }

    next()
  }
}
