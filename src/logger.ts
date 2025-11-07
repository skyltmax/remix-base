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

export const logger = pino(
  process.env.NODE_ENV !== "production"
    ? {
        ...loggerOpts,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      }
    : loggerOpts
)

const expressLoggerOpts: HttpLoggerOpts = {
  logger,

  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers["x-request-id"]
    if (existingID) return existingID
    const id = randomUUID()
    res.setHeader("X-Request-Id", id)
    return id
  },

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

export const expressLogger = pinoHttp(
  process.env.NODE_ENV !== "production"
    ? {
        ...expressLoggerOpts,

        quietReqLogger: true,
        quietResLogger: true,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customReceivedMessage: (req: any) => `Started ${req.method} "${req.url}" for ${req.socket.remoteAddress}`,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customSuccessMessage: (_req: any, res: any) => `Completed ${res.statusCode}`,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customErrorMessage: (_req: any, res: any) => `Failed ${res.statusCode}`,
      }
    : expressLoggerOpts
)

export default logger
