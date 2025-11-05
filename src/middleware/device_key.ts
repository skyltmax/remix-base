import { randomUUID } from "crypto"
import { type RequestHandler } from "express"

export interface DeviceKeyMiddlewareOptions {
  cookieName?: string
  maxAge?: number
}

// set a device key cookie to use as anonymous identifier if it doesn't exist
export const createDeviceKeyMiddleware = (options?: DeviceKeyMiddlewareOptions): RequestHandler => {
  const cookieName = options?.cookieName || "device_key"
  const maxAge = options?.maxAge ?? 1000 * 60 * 60 * 24 * 365

  return async (req, res, next) => {
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

// Backward compatibility - default export with "sm_device_key"
export const deviceKeyMiddleware = createDeviceKeyMiddleware({
  cookieName: "sm_device_key",
})
