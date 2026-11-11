import { Counter } from "@prometheus-io/client"
import getPort, { clearLockedPorts } from "get-port"
import { afterAll, describe, expect, it } from "vitest"
import { metricsRegistry, startMetrics, type MetricsServerHandle } from "./metrics.js"

describe("startMetrics", () => {
  let handle: MetricsServerHandle | undefined

  afterAll(async () => {
    await handle?.stop()
  })

  it("serves default metrics and metrics the app registers through @prometheus-io/client", async () => {
    const port = await getPort()
    // get-port locks the ports it returns, so startMetrics' own availability check would otherwise reject this one.
    clearLockedPorts()
    handle = await startMetrics({ port })

    // An app-side metric created without `registers` lands in the package-global registry, which is the one served.
    new Counter({ name: "app_requests_total", help: "Requests handled by the app" }).inc(3)

    const res = await fetch(`http://127.0.0.1:${handle.port}/metrics`)
    const body = await res.text()

    expect(handle.registry).toBe(metricsRegistry)
    expect(res.headers.get("content-type")).toBe(metricsRegistry.contentType)
    expect(body).toContain("process_cpu_user_seconds_total")
    expect(body).toMatch(/^app_requests_total 3$/m)
  })
})
