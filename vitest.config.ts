import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    outputFile: {
      junit: "../../junit-report.xml",
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
})
