import { type RequestHandler } from "express"
import { createRequest, createResponseMiddleware, type GraphQLClientOptions, type RequestFunc } from "../api/client.js"

export type { GraphQLClientOptions } from "../api/client.js"

declare module "http" {
  interface IncomingMessage {
    request: RequestFunc
  }
}

export interface RequestMiddlewareOptions extends GraphQLClientOptions {
  skipCookies?: boolean
}

export const requestMiddleware = (options?: RequestMiddlewareOptions): RequestHandler => {
  return async (req, res, next) => {
    const { skipCookies, ...clientOptions } = options ?? {}
    req.request = createRequest(req, res, createResponseMiddleware(req, res, skipCookies), clientOptions)
    next()
  }
}
