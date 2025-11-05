const MODE = process.env.NODE_ENV ?? "development"
export const IS_DEV = MODE === "development"
export const IS_PROD = MODE === "production"

export const ENV = process.env.APP_ENV || MODE

export const API_HOST = process.env.API_HOST || "localhost"
export const API_PORT = process.env.API_PORT || 3000
export const API_PATH = process.env.API_PATH || "/graphql"

export const SHARED_SECRET = process.env.SHARED_SECRET || ""
export const SHARED_SECRET_HEADER = process.env.SHARED_SECRET_HEADER || "x-shared-secret"
