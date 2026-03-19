import * as Sentry from "@sentry/react-router"
import { type RequestHandler } from "express"

const MAX_VALUE_LENGTH = 2048
const FILTERED_KEYS = /passw|secret|token|_key|crypt|salt|certificate|otp|ssn|password|cvv|cvc|adyenData/i

function filterParams(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined
  if (typeof obj === "string")
    return obj.length > MAX_VALUE_LENGTH ? `${obj.slice(0, MAX_VALUE_LENGTH)}…[truncated]` : obj
  if (typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(filterParams)

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = FILTERED_KEYS.test(key) ? "[FILTERED]" : filterParams(value)
  }
  return result
}

function serializeParams(query: unknown, body: unknown): string | undefined {
  const params = { ...(query as Record<string, unknown>), ...(body as Record<string, unknown>) }
  if (Object.keys(params).length === 0) return undefined
  return JSON.stringify(filterParams(params))
}

export const sentryScopeMiddleware: RequestHandler = (req, res, next) => {
  let hostname: string | undefined
  try {
    hostname = req.hostname
  } catch {
    /* empty */
  }

  let reqId = undefined

  if (typeof req.id === "string" || typeof req.id === "number") {
    reqId = req.id
  }

  const values = {
    "http.req.id": reqId,
    "http.req.method": req.method,
    "http.req.path": req.path,
    "http.req.host": hostname,
    "http.req.ip_address": req.ip,
    "http.req.referrer": req.get("Referrer"),
    "http.req.user_agent": req.get("User-Agent"),
    "http.req.origin": req.get("Origin"),
    "http.req.params": serializeParams(req.query, req.body),
  }

  Sentry.getIsolationScope().setAttributes(values)
  Sentry.getIsolationScope().setTags(values)

  Sentry.setUser({ ip_address: req.ip })

  res.on("finish", () => {
    const values = {
      "http.res.status": res.statusCode,
      "http.res.location": res.get("Location"),
    }

    Sentry.getIsolationScope().setAttributes(values)
    Sentry.getIsolationScope().setTags(values)
  })

  next()
}
