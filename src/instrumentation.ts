import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"
import { ENV, IS_DEV } from "./env"
import { getRevision } from "./util/revision"

export interface SentryConfig {
  denyUrls?: RegExp[]
  tracesSampleRate?: number
  profilesSampleRate?: number
}

const defaultDenyUrls = [/\/readyz/, /\/livez/, /\/build\//, /\/fonts\//, /\/favicon.ico/, /\/site\.webmanifest/]

export function init(config?: SentryConfig) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: ENV,
    release: getRevision(),
    enabled: !IS_DEV,
    tracesSampleRate: config?.tracesSampleRate ?? 1,
    profilesSampleRate: config?.profilesSampleRate ?? 0.1,
    sendDefaultPii: true,
    denyUrls: config?.denyUrls ?? defaultDenyUrls,
    integrations: [Sentry.httpIntegration(), nodeProfilingIntegration()],
    tracesSampler(samplingContext) {
      if (samplingContext.request?.url?.includes("/readyz") || samplingContext.request?.url?.includes("/livez")) {
        return 0
      }
      return config?.tracesSampleRate ?? 1
    },
  })
}
