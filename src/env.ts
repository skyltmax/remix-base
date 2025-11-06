const MODE = process.env.NODE_ENV ?? "development"
export const IS_DEV = MODE === "development"
export const IS_PROD = MODE === "production"

export const ENV = process.env.APP_ENV || MODE
