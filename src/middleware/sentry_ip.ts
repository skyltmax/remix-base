import * as Sentry from "@sentry/node"
import { type RequestHandler } from "express"

// set correct IP in Sentry context
export const sentryIPMiddleware: RequestHandler = async (req, res, next) => {
  Sentry.setUser({ ip_address: req.ip })
  next()
}
