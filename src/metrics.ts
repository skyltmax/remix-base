import type { Server } from "node:http"
import * as Sentry from "@sentry/node"
import chalk from "chalk"
import closeWithGrace from "close-with-grace"
import express, { type Express } from "express"
import getPort from "get-port"
import {
  collectDefaultMetrics,
  register as defaultRegistry,
  type DefaultMetricsCollectorConfiguration,
  type Registry as PromRegistry,
  type RegistryContentType,
} from "prom-client"
import logger, { expressLogger } from "./logger.js"

export interface MetricsServerHandle {
  stop: () => Promise<void>
  app: Express
  server: Server
  registry: PromRegistry
  port: number
}

export interface StartMetricsOptions {
  port?: string | number
  registry?: PromRegistry
  metricsPath?: string
  collectDefaultMetrics?: boolean | DefaultMetricsCollectorConfiguration<RegistryContentType>
}

export const metricsRegistry: PromRegistry = defaultRegistry

export const startMetrics = async ({
  port = process.env.PROMETHEUS_EXPORTER_PORT || 9394,
  registry,
  metricsPath = "/metrics",
  collectDefaultMetrics: collectDefaultMetricsOption,
}: StartMetricsOptions = {}): Promise<MetricsServerHandle> => {
  const metricsRegistry = registry ?? defaultRegistry

  if (collectDefaultMetricsOption !== false) {
    const collectorConfig =
      typeof collectDefaultMetricsOption === "object" && collectDefaultMetricsOption !== null
        ? { register: metricsRegistry, ...collectDefaultMetricsOption }
        : { register: metricsRegistry }
    collectDefaultMetrics(collectorConfig)
  }

  const metricsApp = express()
  metricsApp.disable("x-powered-by")
  metricsApp.use(expressLogger)

  metricsApp.get(metricsPath, async (req, res) => {
    res.set("Content-Type", metricsRegistry.contentType)
    res.end(await metricsRegistry.metrics())
  })

  const desiredPort = Number(port)
  if (Number.isNaN(desiredPort)) {
    throw new Error(`Invalid metrics port value: ${String(port)}`)
  }

  const portToUse = await getPort({ port: desiredPort })
  const portAvailable = desiredPort === portToUse
  if (!portAvailable) {
    throw new Error(`Metrics port ${desiredPort} is not available`)
  }

  const metricsServer = metricsApp.listen(portToUse, () => {
    logger.info(`Prometheus server listening on port ${portToUse}`)
  }) as Server

  let isClosed = false

  const closeServer = async () => {
    if (isClosed) {
      return
    }
    isClosed = true
    await new Promise((resolve, reject) => {
      metricsServer.close(err => (err ? reject(err) : resolve("ok")))
    })
  }

  closeWithGrace(async ({ err }) => {
    await closeServer()
    if (err) {
      console.error(chalk.red(err))
      console.error(chalk.red(err.stack))

      Sentry.captureException(err)
      await Sentry.flush(500)
    }
  })

  return {
    stop: closeServer,
    app: metricsApp,
    server: metricsServer,
    registry: metricsRegistry,
    port: portToUse,
  }
}
