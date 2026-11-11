import { type HttpResponse, type JsonBodyType, type PathParams, http } from "msw"
import { DEFAULT_ENDPOINT } from "../api/client.js"

export type GqlPersistedRequestBody = {
  operationName?: string
}

export interface GqlOpHandlerOptions {
  endpoint?: string
}

export const gqlOpHandler = (opName: string, handler: HttpResponse<JsonBodyType>, options?: GqlOpHandlerOptions) => {
  const endpoint = options?.endpoint ?? DEFAULT_ENDPOINT

  return http.post<PathParams, GqlPersistedRequestBody, JsonBodyType>(endpoint, async ({ request }) => {
    const params = await request.clone().json()

    if (params && typeof params === "object" && "operationName" in params && params.operationName === opName) {
      return handler
    }

    return undefined
  })
}
