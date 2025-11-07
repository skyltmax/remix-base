import type { Server } from "node:http"
import { createRequestHandler, type GetLoadContextFunction } from "@react-router/express"
import * as Sentry from "@sentry/node"
import chalk from "chalk"
import closeWithGrace from "close-with-grace"
import compression from "compression"
import cookieParser from "cookie-parser"
import express, { type Express, type RequestHandler } from "express"
import getPort from "get-port"
import { type ServerBuild } from "react-router"
import { CloudfrontIpUpdater } from "./cloudfront-ips/updater.js"
import logger, { expressLogger } from "./logger.js"
import { cspMiddleware } from "./middleware/csp.js"
import { endingSlashMiddleware } from "./middleware/ending_slash.js"
import { helmetMiddleware } from "./middleware/helmet.js"
import { noIndexMiddleware } from "./middleware/noindex.js"
import { sentryIPMiddleware } from "./middleware/sentry_ip.js"

export interface ServeAppOptions {
  devServer?: RequestHandler
  middleware?: RequestHandler[]
  getLoadContext?: GetLoadContextFunction
  port?: string | number
  buildDir?: string
  assetsDir?: string
  trustCloudFrontIPs?: boolean
}

export interface ServeAppHandle {
  app: Express
  server: Server
  port: number
  close: () => Promise<void>
}

export const createDefaultMiddleware = (): RequestHandler[] => [
  sentryIPMiddleware,
  endingSlashMiddleware,
  helmetMiddleware,
  noIndexMiddleware,
  cspMiddleware,
]

export async function serveApp(
  build: ServerBuild | (() => Promise<ServerBuild>),
  {
    devServer,
    middleware,
    getLoadContext,
    port = process.env.PORT || 4000,
    buildDir,
    assetsDir,
    trustCloudFrontIPs = true,
  }: ServeAppOptions
): Promise<ServeAppHandle> {
  const app = express()
  let cloudfrontUpdaterInterval: NodeJS.Timeout | undefined

  if (trustCloudFrontIPs) {
    const ipUpdater = new CloudfrontIpUpdater(logger)
    try {
      await ipUpdater.updateTrustProxy(app)
    } catch (error) {
      Sentry.captureException(error)
      logger.error(error, "Failed to refresh CloudFront trust proxy ranges")
    }

    // update the IP ranges every 12 hours
    cloudfrontUpdaterInterval = setInterval(
      async () => {
        try {
          await ipUpdater.updateTrustProxy(app)
        } catch (error) {
          Sentry.captureException(error)
          logger.error(error, "Failed to refresh CloudFront trust proxy ranges")
        }
      },
      1000 * 60 * 60 * 12
    )

    cloudfrontUpdaterInterval.unref?.()
  }

  app.disable("x-powered-by")
  app.use(expressLogger)
  app.use(cookieParser())
  app.use(compression())

  const middlewareStack = middleware ?? createDefaultMiddleware()
  middlewareStack.forEach(m => app.use(m))

  if (devServer) {
    app.use(devServer)
  } else {
    const buildDirPath = buildDir || process.env.BUILD_DIR || "build/client"
    const assetsDirPath = assetsDir || process.env.ASSETS_DIR || `${buildDirPath}/assets`

    // React Router fingerprints its assets so we can cache forever.
    app.use("/assets", express.static(assetsDirPath, { immutable: true, maxAge: "1y" }))

    // Everything else (like favicon.ico) is cached for an hour. You may want to be
    // more aggressive with this caching.
    app.use(express.static(buildDirPath, { maxAge: "1h" }))
  }

  app.get("/livez", (req, res) => {
    res.status(200).send("HI")
  })

  app.all(
    "*splat",
    createRequestHandler({
      build,
      getLoadContext,
    })
  )

  const desiredPort = Number(port)
  if (Number.isNaN(desiredPort)) {
    if (cloudfrontUpdaterInterval) {
      clearInterval(cloudfrontUpdaterInterval)
    }
    throw new Error(`Invalid port value: ${String(port)}`)
  }
  const portToUse = await getPort({ port: desiredPort })
  const portAvailable = desiredPort === portToUse
  if (!portAvailable) {
    if (cloudfrontUpdaterInterval) {
      clearInterval(cloudfrontUpdaterInterval)
    }
    throw new Error(`Port ${desiredPort} is not available`)
  }

  const server = app.listen(portToUse, () => {
    logger.info(`🚀 Server listening on port ${portToUse}`)
  }) as Server

  let isClosed = false

  const closeServer = async () => {
    if (isClosed) {
      return
    }
    isClosed = true
    if (cloudfrontUpdaterInterval) {
      clearInterval(cloudfrontUpdaterInterval)
    }
    await new Promise((resolve, reject) => {
      server.close(e => (e ? reject(e) : resolve("ok")))
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
    app,
    server,
    port: portToUse,
    close: closeServer,
  }
}
