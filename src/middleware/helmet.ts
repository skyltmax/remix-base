import { helmet } from "@nichtsam/helmet/node-http"
import { type RequestHandler } from "express"

export const helmetMiddleware: RequestHandler = async (req, res, next) => {
  helmet(res, {
    // The referrerPolicy breaks our redirectTo logic
    general: { referrerPolicy: false },
    //  The contentSecurityPolicy is set in the entry.server.tsx
    content: false,
  })
  next()
}
