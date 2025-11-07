import type * as express from "express"
import { GraphQLClient, ClientError, type ResponseMiddleware } from "graphql-request"
import setCookie from "set-cookie-parser"
// import { createPersistedQueryFetch } from "./persisted.js"

export type { ResponseMiddleware } from "graphql-request"

export const DEFAULT_ENDPOINT = "http://localhost:3000/graphql"
const DEFAULT_SHARED_SECRET_HEADER = "x-shared-secret"
const DEFAULT_SHARED_SECRET = ""

export interface GraphQLClientOptions {
  endpoint?: string
  sharedSecret?: string
  sharedSecretHeader?: string
  passthroughHeaders?: string[]
  includeDefaultPassthroughHeaders?: boolean
}

export const DEFAULT_PASSTHROUGH_HEADERS = [
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "referer",
  "origin",
  "cookie",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "x-forwarded-for",
  "x-test-header",
]

const buildPassthroughHeaderSet = (options?: GraphQLClientOptions) => {
  const { passthroughHeaders = [], includeDefaultPassthroughHeaders = true } = options ?? {}
  const combined = [...(includeDefaultPassthroughHeaders ? DEFAULT_PASSTHROUGH_HEADERS : []), ...passthroughHeaders]

  return new Set(combined.map(header => header.toLowerCase()))
}

export type Variables = object

export interface GraphQLRequestContext<V extends Variables = Variables> {
  query: string | string[]
  variables?: V
}

export const createClient = (
  uri: string = DEFAULT_ENDPOINT,
  headers: Headers = new Headers(),
  responseMiddleware?: ResponseMiddleware
) => {
  headers.set("content-type", "application/json")

  return new GraphQLClient(uri, {
    headers: () => {
      headers.set("x-request-at", Date.now().toString())
      return headers
    },
    responseMiddleware,
    // fetch: createPersistedQueryFetch((url, init) => {
    //   return fetch(url, { keepalive: true, ...init })
    // }),
    fetch: (url, init) => {
      return fetch(url, { keepalive: true, ...init })
    },
  })
}

export type RequestFunc = typeof GraphQLClient.prototype.request

export const createResponseMiddleware =
  (request: express.Request, response: express.Response, skipCookies?: boolean): ResponseMiddleware =>
  (gqlResponse, gqlRequest) => {
    if (!(gqlResponse instanceof Error)) {
      // log the request id and status
      const gqlReqId = gqlResponse.headers.get("x-request-id")
      const gqlStatus = gqlResponse.status

      const reqStarted = gqlResponse.headers.get("x-request-at")
      const reqDuration = Date.now() - parseInt(reqStarted || "0")

      if (gqlRequest.operationName) {
        request.log.info(
          {
            gqlReqId: gqlReqId,
            gqlOperation: gqlRequest.operationName,
            gqlStatus: gqlStatus,
            gqlDuration: reqDuration,
          },
          `API request ${gqlRequest.operationName} ${gqlReqId} returned with status ${gqlStatus} in ${reqDuration}ms`
        )
      } else {
        request.log.info(
          {
            gqlReqId: gqlReqId,
            gqlStatus: gqlStatus,
            gqlDuration: reqDuration,
          },
          `API request ${gqlReqId} returned with status ${gqlStatus} in ${reqDuration}ms`
        )
      }

      if (response.headersSent) {
        request.log.warn(`Response headers already sent, cannot set headers for request ${gqlReqId}`)
        return
      }

      if (gqlResponse.headers.get("server-timing")) {
        response.appendHeader("server-timing", gqlResponse.headers.get("server-timing")!)
      }

      // pass updated cookies from the API to the client
      const setCookieHeader = gqlResponse.headers.get("set-cookie")

      if (!skipCookies && setCookieHeader) {
        const newCookies = setCookie.parse(setCookie.splitCookiesString(setCookieHeader), {
          map: true,
          decodeValues: true,
        })

        for (const [key, value] of Object.entries(newCookies)) {
          const newCookie = value

          response.cookie(key, newCookie.value, {
            path: newCookie.path,
            expires: newCookie.expires,
            maxAge: newCookie.maxAge ? newCookie.maxAge * 1000 : undefined,
            secure: newCookie.secure,
            domain: newCookie.domain,
            sameSite: "lax",
            httpOnly: true,
          })
        }
      }
    } else if (gqlResponse instanceof ClientError) {
      const errRequest = gqlResponse.request as GraphQLRequestContext<{
        password?: string
      }>
      if (errRequest.variables && errRequest.variables.password) {
        delete errRequest.variables.password
        delete gqlResponse.stack
        gqlResponse.message = "--redacted--"
      }

      for (const error of gqlResponse.response.errors || []) {
        if (error.extensions?.code === "unauthorized") {
          request.log.error(error)
          throw new Response("Unauthorized", { status: 403 })
        }
      }

      request.log.error(gqlResponse)
      throw new Response(gqlResponse.message, {
        status: gqlResponse.response.status,
      })
    } else {
      request.log.error(gqlResponse)
      throw gqlResponse
    }
  }

// prepares graphql request with a preconfigured client which is shared across a single request
export const createRequest = (
  request: express.Request,
  response: express.Response,
  responseMiddleware?: ResponseMiddleware,
  options?: GraphQLClientOptions
): RequestFunc => {
  const headers = new Headers()
  const {
    endpoint = DEFAULT_ENDPOINT,
    sharedSecret = DEFAULT_SHARED_SECRET,
    sharedSecretHeader = DEFAULT_SHARED_SECRET_HEADER,
  } = options ?? {}
  const passthroughHeaderSet = buildPassthroughHeaderSet(options)

  for (const [key, values] of Object.entries(request.headers)) {
    const normalizedKey = key.toLowerCase()
    if (!passthroughHeaderSet.has(normalizedKey)) {
      continue
    }

    if (values) {
      if (Array.isArray(values)) {
        for (const value of values) {
          headers.append(key, value)
        }
      } else {
        headers.set(key, values)
      }
    }
  }

  headers.set("host", request.hostname)
  headers.set("x-forwarded-proto", request.protocol === "https" ? "https" : "http")
  if (sharedSecret) {
    headers.set(sharedSecretHeader, sharedSecret)
  }

  const client = createClient(endpoint, headers, responseMiddleware)

  return client.request.bind(client)
}

// prepares graphql request using a Fetch API Request
export const createSimpleRequest = (
  request: Request,
  responseMiddleware?: ResponseMiddleware,
  options?: GraphQLClientOptions
): GraphQLClient["request"] => {
  const url = new URL(request.url)
  const headers = new Headers()
  const {
    endpoint = DEFAULT_ENDPOINT,
    sharedSecret = DEFAULT_SHARED_SECRET,
    sharedSecretHeader = DEFAULT_SHARED_SECRET_HEADER,
  } = options ?? {}
  const passthroughHeaderSet = buildPassthroughHeaderSet(options)

  for (const [key, value] of request.headers.entries()) {
    const normalizedKey = key.toLowerCase()
    if (!passthroughHeaderSet.has(normalizedKey)) {
      continue
    }

    if (value) {
      headers.set(key, value)
    }
  }

  headers.set("host", url.host)
  headers.set("x-forwarded-proto", url.protocol === "https:" ? "https" : "http")
  if (sharedSecret) {
    headers.set(sharedSecretHeader, sharedSecret)
  }

  const client = createClient(endpoint, headers, responseMiddleware)

  return client.request.bind(client)
}
