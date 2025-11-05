import { LRUCache } from "lru-cache"

// https://github.com/jasonkuhrt/graphql-request/issues/269

const VERSION = 1
type Fetch = typeof fetch

/**
 * Creates a fetch implementation that sends GraphQL persisted query requests.
 */
export const createPersistedQueryFetch =
  (fetchImpl: Fetch): Fetch =>
  async (info, init) => {
    const request = { info, init }

    const processor = getRequestProcessor(request)

    const requestWithQueryHash = await processor.addHash(request)
    const requestWithoutQuery = processor.removeQuery(requestWithQueryHash)

    // send a request without the query
    const res = await fetchImpl(requestWithoutQuery.info, requestWithoutQuery.init)

    if (!res.ok) {
      // if the request failed, return the response as is
      return res
    }

    const body = await res.clone().json()

    // if the query was not found in the server,
    // send another request with the query
    if (isPersistedQueryNotFoundError(body)) {
      return fetchImpl(requestWithQueryHash.info, requestWithQueryHash.init)
    } else {
      return new Response(JSON.stringify(body), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    }
  }

/**
 * Manipulates a fetch request, implemented per HTTP method type.
 */
interface RequestProcessor {
  /**
   * Removes the GraphQL query argument from the request
   */
  removeQuery(request: Request): Request

  /**
   * Adds the GraphQL request query hash to the request
   */
  addHash(request: Request): Promise<Request>
}

function getRequestProcessor(request: Request) {
  const method = (request.init?.method ?? "GET").toUpperCase()
  const requestProcessor = requestProcessorByMethod[method]

  if (!requestProcessor) {
    throw new Error("Unsupported request method: " + method)
  }

  return requestProcessor
}

const requestProcessorByMethod: Record<string, RequestProcessor> = {
  GET: {
    removeQuery: request => {
      const [url, params] = splitUrlAndSearchParams(getRequestInfoUrl(request.info))
      params.delete("query")
      return {
        ...request,
        info: requestInfoWithUpdatedUrl(request.info, `${url}?${params.toString()}`),
      }
    },
    addHash: async request => {
      const [url, params] = splitUrlAndSearchParams(getRequestInfoUrl(request.info))

      const query = params.get("query")
      if (!query) {
        throw new Error("GET request must contain a query parameter")
      }

      const hash = await hashCache(query)

      params.append(
        "extensions",
        JSON.stringify({
          persistedQuery: {
            version: VERSION,
            sha256Hash: hash,
          },
        })
      )

      return {
        ...request,
        info: requestInfoWithUpdatedUrl(request.info, `${url}?${params.toString()}`),
      }
    },
  },
  POST: {
    removeQuery: request => {
      if (typeof request.init?.body !== "string") {
        throw new Error("POST request must contain a body")
      }

      const body = JSON.parse(request.init.body)
      if (!isGraphQLRequest(body)) {
        throw new Error("POST request body must be a GraphQL request")
      }

      const { query, ...bodyWithoutQuery } = body

      return {
        ...request,
        init: {
          ...request.init,
          body: JSON.stringify(bodyWithoutQuery),
        },
      }
    },
    addHash: async request => {
      if (typeof request.init?.body !== "string") {
        throw new Error("POST request must contain a body")
      }

      const body = JSON.parse(request.init.body)
      if (!isGraphQLRequest(body)) {
        throw new Error("POST request body must be a GraphQL request")
      }

      if (typeof body.query !== "string") {
        throw new Error("POST request body must contain a query")
      }

      const hash = await hashCache(body.query)

      return {
        ...request,
        init: {
          ...request.init,
          body: JSON.stringify({
            ...body,
            extensions: {
              persistedQuery: {
                version: VERSION,
                sha256Hash: hash,
              },
            },
          }),
        },
      }
    },
  },
}

interface Request {
  info: RequestInfo | URL
  init?: RequestInit
}

function requestInfoWithUpdatedUrl(info: RequestInfo | URL, url: string): RequestInfo {
  if (info instanceof URL) {
    return new URL(url).toString()
  }

  return typeof info === "string"
    ? url
    : {
        ...info,
        url,
      }
}

function getRequestInfoUrl(info: RequestInfo | URL) {
  if (info instanceof URL) {
    return info.toString()
  }

  return typeof info === "string" ? info : info.url
}

function splitUrlAndSearchParams(url: string): [urlWithoutSearchParams: string, params: URLSearchParams] {
  const startOfSearchParams = url.indexOf("?")

  return startOfSearchParams === -1
    ? [url, new URLSearchParams()]
    : [url.slice(0, startOfSearchParams), new URLSearchParams(url.slice(startOfSearchParams))]
}

const cache = new LRUCache({ max: 1000 })

async function hashCache(query: string) {
  const cached = cache.get(query)

  if (cached) {
    return cached
  }

  const hash = await sha256(query)
  cache.set(query, hash)
  return hash
}

/**
 * Copied from https://newbedev.com/javascript-sha256-hash-js-code-example
 */
async function sha256(message: string) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message)

  // hash the message
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer))

  // convert bytes to hex string
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}

interface GraphQLRequest {
  query?: string
}

function isGraphQLRequest(req: unknown): req is GraphQLRequest {
  if (typeof req !== "object" || req === null) return false

  return true
}

interface GraphQLResponse {
  errors?: {
    message?: string
    extensions?: {
      code?: string
    }
  }[]
}

function isGraphQLResponse(resBody: unknown): resBody is GraphQLResponse {
  return !!(
    resBody &&
    typeof resBody === "object" &&
    (("errors" in resBody && Array.isArray(resBody.errors)) || !("errors" in resBody))
  )
}

function isPersistedQueryNotFoundError(resBody: unknown) {
  return (
    isGraphQLResponse(resBody) &&
    resBody.errors &&
    resBody.errors.length > 0 &&
    resBody.errors.find(
      err => err.message === "PersistedQueryNotFound" || err.extensions?.code === "PERSISTED_QUERY_NOT_FOUND"
    ) != null
  )
}
