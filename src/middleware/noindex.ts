import { type RequestHandler } from "express"

export const noIndexMiddleware: RequestHandler = async (req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow")
  next()
}
