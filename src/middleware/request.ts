import { type RequestHandler } from "express"
import { createRequest, createResponseMiddleware, type RequestFunc } from "../api/client"

declare module "http" {
  interface IncomingMessage {
    request: RequestFunc
  }
}

export const requestMiddleware: RequestHandler = async (req, res, next) => {
  req.request = createRequest(req, res, createResponseMiddleware(req, res))
  next()
}
