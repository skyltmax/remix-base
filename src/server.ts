import type { Server } from "node:http"
import { createRequestHandler, type GetLoadContextFunction } from "@react-router/express"
import * as Sentry from "@sentry/react-router"
import chalk from "chalk"
import closeWithGrace from "close-with-grace"
import compression from "compression"
import cookieParser from "cookie-parser"
import express, { type Express, type RequestHandler } from "express"
import getPort from "get-port"
import { type ServerBuild } from "react-router"
import logger, { expressLogger } from "./logger.js"
import { cspMiddleware } from "./middleware/csp.js"
import { endingSlashMiddleware } from "./middleware/ending_slash.js"
import { helmetMiddleware } from "./middleware/helmet.js"
import { sentryScopeMiddleware } from "./middleware/sentry_scope.js"

export interface ServeAppOptions {
  devServer?: RequestHandler
  /** Runs after the access logger and before compression, static files, cookie parsing and `middleware`. For handlers
   *  that must answer without the app's response processing, such as a reverse proxy. A handler that calls `next()`
   *  falls through to the regular stack. */
  preMiddleware?: RequestHandler[]
  middleware?: RequestHandler[]
  getLoadContext?: GetLoadContextFunction
  port?: string | number
  buildDir?: string
  assetsDir?: string
  /** Express `trust proxy` value, applied once at startup. Defaults to `["loopback", "linklocal", "uniquelocal"]`;
   *  `false` leaves proxy trust off. */
  trustProxy?: string[] | false
}

const DEFAULT_TRUST_PROXY = ["loopback", "linklocal", "uniquelocal"]

export interface ServeAppHandle {
  app: Express
  server: Server
  port: number
  close: () => Promise<void>
}

export const createDefaultMiddleware = (): RequestHandler[] => [endingSlashMiddleware, helmetMiddleware, cspMiddleware]

export async function serveApp(
  build: ServerBuild | (() => Promise<ServerBuild>),
  {
    devServer,
    preMiddleware,
    middleware,
    getLoadContext,
    port = process.env.PORT || 4000,
    buildDir,
    assetsDir,
    trustProxy = [...DEFAULT_TRUST_PROXY],
  }: ServeAppOptions
): Promise<ServeAppHandle> {
  const app = express()

  if (trustProxy !== false) {
    app.set("trust proxy", trustProxy)
  }

  app.disable("x-powered-by")
  app.use(expressLogger)
  preMiddleware?.forEach(m => app.use(m))
  app.use(compression())

  app.get("/livez", (req, res) => {
    res.status(200).send("HI")
  })

  app.use(sentryScopeMiddleware)

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

  app.use(cookieParser())

  const middlewareStack = middleware ?? createDefaultMiddleware()
  middlewareStack.forEach(m => app.use(m))

  app.all(
    "*splat",
    createRequestHandler({
      build,
      getLoadContext,
    })
  )

  const desiredPort = Number(port)
  if (Number.isNaN(desiredPort)) {
    throw new Error(`Invalid port value: ${String(port)}`)
  }
  const portToUse = await getPort({ port: desiredPort })
  const portAvailable = desiredPort === portToUse
  if (!portAvailable) {
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
