import * as https from "https"
import { type Application } from "express"
import type pino from "pino"
import backupIps from "./backup.json" with { type: "json" }
import vpcIps from "./vpc.json" with { type: "json" }

interface Service {
  ip_prefix: string
  region: string
  service: string
}

interface Ipv6Service {
  ipv6_prefix: string
  region: string
  service: string
}

interface ServicePrefix {
  prefixes: Service[]
  ipv6_prefixes: Ipv6Service[]
}

const isServicePrefix = (data: unknown): data is ServicePrefix => {
  if (typeof data !== "object" || data === null) return false

  if (
    "prefixes" in data &&
    "ipv6_prefixes" in data &&
    Array.isArray(data.prefixes) &&
    Array.isArray(data.ipv6_prefixes)
  ) {
    return true
  }

  return false
}

export class CloudfrontIpUpdater {
  private readonly logger: pino.Logger
  private lastIps: string[] = []
  private readonly vpcIps: string[] = []
  private readonly maxRetries: number = 3
  private readonly retryDelay: number = 500 // Initial delay in ms

  constructor(
    logger: pino.Logger,
    private _apiUrl: string = "https://ip-ranges.amazonaws.com/ip-ranges.json"
  ) {
    this.logger = logger
    this.lastIps = this.validateIpList(backupIps)
    this.vpcIps = this.validateIpList(vpcIps)
  }

  get apiUrl(): string {
    return this._apiUrl
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async getJSON(retryCount = 0): Promise<ServicePrefix> {
    return new Promise<ServicePrefix>((resolve, reject) => {
      const request = https
        .get(this.apiUrl, res => {
          let body = ""

          res.on("data", data => {
            body += data
          })

          res.on("end", () => {
            try {
              const result = JSON.parse(body)

              if (isServicePrefix(result)) {
                resolve(result)
              } else {
                reject(new Error("Invalid result"))
              }
            } catch (error) {
              reject(error)
            }
          })
        })
        .on("error", async error => {
          if (retryCount < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, retryCount)

            this.logger.warn(
              { error, retryCount, delay },
              `IP fetch request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`
            )

            await this.sleep(delay)

            try {
              const result = await this.getJSON(retryCount + 1)
              resolve(result)
            } catch (retryError) {
              reject(retryError)
            }
          } else {
            this.logger.error({ error, retryCount }, "IP fetch request failed after all retries")
            reject(error)
          }
        })

      // Set timeout to 1 second
      request.setTimeout(1000, () => {
        request.destroy()
        // Destroying the request will trigger the 'error' event with an abort error
      })
    })
  }

  public async getIpRange(service = "CLOUDFRONT"): Promise<string[]> {
    const results = await this.getJSON()
    const ips: string[] = []

    ips.push(...results.prefixes.filter(p => p.service === service).map(({ ip_prefix }) => ip_prefix))
    ips.push(...results.ipv6_prefixes.filter(p => p.service === service).map(({ ipv6_prefix }) => ipv6_prefix))

    // write new list to file, useful when updating backup.json
    // fs.writeFileSync(path.resolve(__dirname, "new.json"), JSON.stringify(ips, null, 2))

    return ips
  }

  public async updateTrustProxy(expressApp: Application) {
    const trustProxyBase = ["loopback", "linklocal", "uniquelocal"] as const
    expressApp.set("trust proxy", [...trustProxyBase, ...this.lastIps, ...this.vpcIps])

    let ips: string[]
    try {
      ips = await this.getIpRange()
    } catch (error) {
      this.logger.error(error, "Failed to fetch CloudFront IP ranges; retaining previous list")
      throw error
    }

    if (ips.length === 0) {
      this.logger.warn("Received empty CloudFront IP range set; retaining previous list")
      return
    }

    this.lastIps = ips
    expressApp.set("trust proxy", [...trustProxyBase, ...ips, ...this.vpcIps])
    this.logger.info("Updated trust proxy")
  }

  private validateIpList(list: unknown): string[] {
    if (!Array.isArray(list)) {
      return []
    }

    if (!list.every(item => typeof item === "string")) {
      return []
    }

    return list
  }
}
