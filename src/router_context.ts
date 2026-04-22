import * as Sentry from "@sentry/react-router"
import type * as express from "express"
import { type Logger } from "pino"
import { createContext, RouterContextProvider } from "react-router"
import type { RequestFunc } from "./api/client.js"
import { getRevision } from "./util/revision.js"

export interface ServerContext {
  revision?: string
  gqlRequest: RequestFunc
  log: Logger
  ip?: string
  cspNonce: string
}

declare module "http" {
  interface IncomingMessage {
    request: RequestFunc
  }
}

const REVISION = getRevision()

export const serverContext = createContext<ServerContext>()

export const getServerContext = (request: express.Request, response: express.Response) => {
  Sentry.setUser({ ip_address: request.ip })

  const context = new RouterContextProvider()

  context.set(serverContext, {
    revision: REVISION,
    gqlRequest: request.request,
    log: request.log,
    ip: request.ip,
    cspNonce: response.locals.cspNonce,
  })

  return context
}
