import crypto from "node:crypto"
import { type RequestHandler } from "express"

export const cspMiddleware: RequestHandler = async (req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex")
  next()
}
