import { type JsonBodyType, type PathParams, type StrictResponse, http } from "msw"
import { API_HOST, API_PORT, API_PATH } from "../env"

export type GqlPersistedRequestBody = {
  operationName?: string
}

export const gqlOpHandler = (opName: string, handler: StrictResponse<JsonBodyType>) => {
  return http.post<PathParams, GqlPersistedRequestBody, JsonBodyType>(
    `http://${API_HOST}:${API_PORT}${API_PATH}`,
    async ({ request }) => {
      const params = await request.clone().json()

      if (params && typeof params === "object" && "operationName" in params && params.operationName === opName) {
        return handler
      }

      return undefined
    }
  )
}
