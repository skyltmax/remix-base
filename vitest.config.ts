import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    outputFile: {
      junit: "../../junit-report.xml",
    },
  },
})
