import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPersistedQueryFetch } from "./persisted.js"

describe("createPersistedQueryFetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.clearAllMocks()
  })

  describe("GET requests", () => {
    it("should send request without query first, then with query if not found", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?query=${encodeURIComponent(query)}`

      // First response: persisted query not found
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: "PersistedQueryNotFound" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      )

      // Second response: success
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { user: { id: "123" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch(url, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(2)

      // First call should be without query
      const firstCall = mockFetch.mock.calls[0]
      expect(firstCall).toBeDefined()
      expect(firstCall![0]).not.toContain("query=")
      expect(firstCall![0]).toContain("extensions=")

      // Second call should have the full query
      const secondCall = mockFetch.mock.calls[1]
      expect(secondCall).toBeDefined()
      // URL encoding uses + for spaces, not %20
      expect(secondCall![0]).toContain("query=query")
      expect(secondCall![0]).toContain("user")
      expect(secondCall![0]).toContain("id")

      const body = await result.json()
      expect(body).toEqual({ data: { user: { id: "123" } } })
    })

    it("should return first response if query is found", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?query=${encodeURIComponent(query)}`

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { user: { id: "123" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch(url, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const body = await result.json()
      expect(body).toEqual({ data: { user: { id: "123" } } })
    })

    it("should handle PERSISTED_QUERY_NOT_FOUND error code", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?query=${encodeURIComponent(query)}`

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ extensions: { code: "PERSISTED_QUERY_NOT_FOUND" } }],
          }),
          { status: 200 }
        )
      )

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      await persistedFetch(url, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should return error response if request fails", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?query=${encodeURIComponent(query)}`

      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        })
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch(url, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.status).toBe(500)
      expect(result.ok).toBe(false)
    })

    it("should throw if GET request has no query parameter", async () => {
      const url = "http://api.example.com/graphql"

      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(persistedFetch(url, { method: "GET" })).rejects.toThrow("GET request must contain a query parameter")
    })

    it("should handle URLs with existing query parameters", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?operationName=GetUser&query=${encodeURIComponent(query)}`

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      await persistedFetch(url, { method: "GET" })

      const firstCall = mockFetch.mock.calls[0]
      expect(firstCall).toBeDefined()
      expect(firstCall![0]).toContain("operationName=GetUser")
      expect(firstCall![0]).not.toContain(`query=${encodeURIComponent(query)}`)
    })
  })

  describe("POST requests", () => {
    it("should send request without query first, then with query if not found", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
        variables: { id: "123" },
      })

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: "PersistedQueryNotFound" }],
          }),
          { status: 200 }
        )
      )

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)

      // First call should be without query
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string) as {
        query?: string
        extensions?: unknown
        variables?: unknown
      }
      expect(firstCallBody.query).toBeUndefined()
      expect(firstCallBody.extensions).toBeDefined()
      expect(firstCallBody.variables).toEqual({ id: "123" })

      // Second call should have the full query
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string) as { query?: string }
      expect(secondCallBody.query).toBe("query { user { id } }")

      const resultBody = await result.json()
      expect(resultBody).toEqual({ data: { user: { id: "123" } } })
    })

    it("should return first response if query is found", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
      })

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const resultBody = await result.json()
      expect(resultBody).toEqual({ data: { user: { id: "123" } } })
    })

    it("should throw if POST request has no body", async () => {
      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(
        persistedFetch("http://api.example.com/graphql", {
          method: "POST",
        })
      ).rejects.toThrow("POST request must contain a body")
    })

    it("should throw if POST request body is not a string", async () => {
      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(
        persistedFetch("http://api.example.com/graphql", {
          method: "POST",
          body: new FormData(),
        })
      ).rejects.toThrow("POST request must contain a body")
    })

    it("should throw if POST request body has no query when adding hash", async () => {
      // The isGraphQLRequest function accepts any object, so this tests the query check in addHash
      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(
        persistedFetch("http://api.example.com/graphql", {
          method: "POST",
          body: JSON.stringify({ invalid: "body" }),
        })
      ).rejects.toThrow("POST request body must contain a query")
    })

    it("should throw if POST request body has no query", async () => {
      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(
        persistedFetch("http://api.example.com/graphql", {
          method: "POST",
          body: JSON.stringify({ variables: {} }),
        })
      ).rejects.toThrow("POST request body must contain a query")
    })

    it("should preserve response status and headers", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
      })

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { user: { id: "123" } } }), {
          status: 201,
          statusText: "Created",
          headers: { "x-custom": "header" },
        })
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(result.status).toBe(201)
      expect(result.statusText).toBe("Created")
      expect(result.headers.get("x-custom")).toBe("header")
    })
  })

  describe("RequestInfo types", () => {
    it("should handle URL object as RequestInfo", async () => {
      const query = "query { user { id } }"
      const url = new URL(`http://api.example.com/graphql?query=${encodeURIComponent(query)}`)

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      await persistedFetch(url, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("should handle Request object as RequestInfo", async () => {
      const query = "query { user { id } }"
      const request = new Request(`http://api.example.com/graphql?query=${encodeURIComponent(query)}`, {
        method: "GET",
      })

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      await persistedFetch(request, { method: "GET" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe("Hash caching", () => {
    it("should cache query hashes", async () => {
      const query = "query { user { id } }"
      const body = JSON.stringify({ query })

      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)

      // Make two requests with the same query
      await persistedFetch("http://api.example.com/graphql", { method: "POST", body })
      await persistedFetch("http://api.example.com/graphql", { method: "POST", body })

      // Both should produce the same hash in extensions
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string) as {
        extensions: { persistedQuery: { sha256Hash: string } }
      }
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string) as {
        extensions: { persistedQuery: { sha256Hash: string } }
      }

      expect(firstCallBody.extensions.persistedQuery.sha256Hash).toBe(
        secondCallBody.extensions.persistedQuery.sha256Hash
      )
    })
  })

  describe("Unsupported methods", () => {
    it("should throw error for unsupported HTTP methods", async () => {
      const persistedFetch = createPersistedQueryFetch(mockFetch)

      await expect(
        persistedFetch("http://api.example.com/graphql", {
          method: "PUT",
          body: JSON.stringify({ query: "query { user { id } }" }),
        })
      ).rejects.toThrow("Unsupported request method: PUT")
    })

    it("should default to GET if no method specified", async () => {
      const query = "query { user { id } }"
      const url = `http://api.example.com/graphql?query=${encodeURIComponent(query)}`

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      await persistedFetch(url)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      // Should process as GET request
      const firstCall = mockFetch.mock.calls[0]
      expect(firstCall).toBeDefined()
      expect(firstCall![0]).toContain("extensions=")
    })
  })

  describe("Error response handling", () => {
    it("should handle responses with no errors field", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
      })

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: { id: "123" } } }), { status: 200 }))

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const resultBody = await result.json()
      expect(resultBody).toEqual({ data: { user: { id: "123" } } })
    })

    it("should handle responses with empty errors array", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
      })

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { user: { id: "123" } }, errors: [] }), { status: 200 })
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const resultBody = await result.json()
      expect(resultBody).toEqual({ data: { user: { id: "123" } }, errors: [] })
    })

    it("should not retry for other GraphQL errors", async () => {
      const body = JSON.stringify({
        query: "query { user { id } }",
      })

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: "Something went wrong" }],
          }),
          { status: 200 }
        )
      )

      const persistedFetch = createPersistedQueryFetch(mockFetch)
      const result = await persistedFetch("http://api.example.com/graphql", {
        method: "POST",
        body,
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const resultBody = (await result.json()) as { errors: Array<{ message: string }> }
      expect(resultBody.errors[0]!.message).toBe("Something went wrong")
    })
  })
})
