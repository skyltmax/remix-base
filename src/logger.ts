import { randomUUID } from "node:crypto"
import pino, { type LoggerOptions } from "pino"

import pinohttpImport, { type Options as HttpLoggerOpts } from "pino-http"

// pino-http doesn't properly export as ESM, so we need to handle both CJS and ESM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pinoHttp: any = "default" in pinohttpImport ? pinohttpImport.default : pinohttpImport

const loggerOpts: LoggerOptions = {
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: label => {
      return {
        level: label,
      }
    },
  },
}

export const logger = pino(loggerOpts)

const expressLoggerOpts: HttpLoggerOpts = {
  logger,

  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers["x-request-id"]
    if (existingID) return existingID
    const id = randomUUID()
    res.setHeader("X-Request-Id", id)
    return id
  },

  // Fields an app sets on `res.locals.log` before the response ends are merged into the "request completed" line.
  customProps: (req, res) => (res as { locals?: { log?: Record<string, unknown> } }).locals?.log ?? {},

  autoLogging: {
    ignore(req) {
      return (
        /\.(ts|tsx|css|js|map|png|webm|webp)$/.test(req.url || "") ||
        /^\/(@vite|@id|node_modules|fonts|adminfonts)/.test(req.url || "") ||
        /\.(ts|tsx|css|js|map|png|webm|webp)\?.+/.test(req.url || "") ||
        false
      )
    },
  },

  serializers: {
    req: req => ({
      id: req.id,
      ip: req.ip || req.headers["x-forwarded-for"] || req.remoteAddress,
      headers: {
        host: req.headers.host,
        origin: req.headers.origin,
        "user-agent": req.headers["user-agent"],
      },
      params: req.params,
      method: req.method,
      url: req.url,
    }),
    res: res => ({
      headers: {
        "content-type": res.headers["content-type"],
      },
      statusCode: res.statusCode,
    }),
  },
}

export const expressLogger = pinoHttp(expressLoggerOpts)

export default logger
