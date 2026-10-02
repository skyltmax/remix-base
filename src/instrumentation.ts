import { nodeProfilingIntegration } from "@sentry/profiling-node"
import * as Sentry from "@sentry/react-router"
import { getRevision } from "./util/revision.js"

const SENTRY_DSN = process.env.SENTRY_DSN
const defaultDenyUrls = [
  /\/readyz/,
  /\/livez/,
  /\/metrics/,
  /\/build\//,
  /\/fonts\//,
  /\/favicon.ico/,
  /\/site\.webmanifest/,
]

export function init(config: Parameters<typeof Sentry.init>[0]) {
  const environment = config.environment ?? (process.env.NODE_ENV || "development")
  const tracesSampleRate = config?.tracesSampleRate ?? 1

  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    release: getRevision(),
    enabled: ["production", "staging"].includes(environment),
    tracesSampleRate: 1,
    profileSessionSampleRate: 0.1,
    profileLifecycle: "trace",
    // Replaces the deprecated `sendDefaultPii: true`; setting `dataCollection` at all switches to the SDK defaults (user
    // info, cookies, headers, query params on). No custom deny list needed: the SDK always filters keys matching its
    // built-in sensitive snippets (auth, token, session, cookie, key, ...), which covers our session and device key
    // cookies and the Authorization/Cookie headers. A caller-supplied `sendDefaultPii` is ignored once this is set.
    dataCollection: { httpBodies: [] },
    denyUrls: defaultDenyUrls,
    enableLogs: true,
    integrations: [
      // Incoming request body capture is gated only by this option, not by `dataCollection.httpBodies`, and the
      // captured body is attached to every event including transactions (e.g. login POSTs).
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
      nodeProfilingIntegration(),
      Sentry.pinoIntegration(),
    ],
    beforeSendLog(event) {
      const req = event.attributes?.["req"] as { url?: string; method?: string } | undefined

      if (req) {
        // Ignore logs from health checks and static assets
        const url = req.url
        if (url && defaultDenyUrls.some(regex => regex.test(url))) {
          return null
        }

        if (event.attributes && event.message === "request completed" && req.method && req.url) {
          event.message = `${req.method} ${req.url}`
        }
      }

      delete event.attributes?.req
      delete event.attributes?.res

      return event
    },
    tracesSampler(samplingContext) {
      const url = samplingContext.request?.url
      if (url?.includes("/readyz") || url?.includes("/livez") || url?.includes("/metrics")) {
        return 0
      }
      return tracesSampleRate
    },
    beforeSend(event) {
      // Filter out 404s from error reporting
      if (event.exception) {
        const error = event.exception.values?.[0]
        if (error?.type === "NotFoundException" || error?.value?.includes("404")) {
          return null
        }
      }
      return event
    },
    ...config,
  })
}
