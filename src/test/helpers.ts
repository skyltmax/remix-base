import { type JsonBodyType, type PathParams, type StrictResponse, http } from "msw"
import { DEFAULT_ENDPOINT } from "../api/client"

export type GqlPersistedRequestBody = {
  operationName?: string
}

export interface GqlOpHandlerOptions {
  endpoint?: string
}

export const gqlOpHandler = (opName: string, handler: StrictResponse<JsonBodyType>, options?: GqlOpHandlerOptions) => {
  const endpoint = options?.endpoint ?? DEFAULT_ENDPOINT

  return http.post<PathParams, GqlPersistedRequestBody, JsonBodyType>(endpoint, async ({ request }) => {
    const params = await request.clone().json()

    if (params && typeof params === "object" && "operationName" in params && params.operationName === opName) {
      return handler
    }

    return undefined
  })
}
