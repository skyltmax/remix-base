import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"
import { getRevision } from "./util/revision.js"

export { type NodeOptions } from "@sentry/node"

export interface SentryConfig {
  dsn: string
  configuration?: Sentry.NodeOptions
}

const defaultDenyUrls = [/\/readyz/, /\/livez/, /\/build\//, /\/fonts\//, /\/favicon.ico/, /\/site\.webmanifest/]

export function init(config: SentryConfig) {
  Sentry.init({
    dsn: config.dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: getRevision(),
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 1,
    profilesSampleRate: 0.1,
    sendDefaultPii: true,
    denyUrls: defaultDenyUrls,
    integrations: [Sentry.httpIntegration(), nodeProfilingIntegration()],
    tracesSampler(samplingContext) {
      if (samplingContext.request?.url?.includes("/readyz") || samplingContext.request?.url?.includes("/livez")) {
        return 0
      }
      return config.configuration?.tracesSampleRate ?? 1
    },
    ...config.configuration,
  })
}
