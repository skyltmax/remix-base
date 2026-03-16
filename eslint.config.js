import { config as defaultConfig } from "@signmax/config/eslint"

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["reset.d.ts", "vitest.config.ts"],
  },
  ...defaultConfig,
]
