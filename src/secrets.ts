import { SecretsManagerClient, GetSecretValueCommand, ResourceNotFoundException } from "@aws-sdk/client-secrets-manager"
import { ENV } from "./env"
import logger from "./logger"

export interface LoadSecretsOptions {
  secretName?: string
  region?: string
}

export interface Secrets {
  [key: string]: unknown
}

/**
 * Load secrets from AWS Secrets Manager.
 * This is a utility function that users can call if they need to load secrets.
 *
 * @example
 * ```typescript
 * import { loadSecrets, type Secrets } from "@signmax/remix-base/secrets"
 *
 * interface MySecrets extends Secrets {
 *   apiKey: string
 *   dbPassword: string
 * }
 *
 * const secrets = await loadSecrets<MySecrets>({
 *   secretName: "my-app/secrets",
 *   region: "us-east-1"
 * })
 * ```
 */
export async function loadSecrets<T extends Secrets = Secrets>(options?: LoadSecretsOptions): Promise<T> {
  const secretName = options?.secretName || process.env.AWS_SECRET_NAME || `app/env/${ENV}`
  const region = options?.region || process.env.AWS_REGION || "eu-central-1"

  const client = new SecretsManagerClient({ region })

  let secretString: string

  if (process.env.CI === "true") {
    secretString = "{}"
  } else {
    try {
      const response = await client.send(
        new GetSecretValueCommand({
          SecretId: secretName,
          VersionStage: "AWSCURRENT",
        })
      )

      secretString = response.SecretString || "{}"
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // The secret was not found, return empty object
        secretString = "{}"
      } else {
        logger.error(error)
        throw error
      }
    }
  }

  const secrets: Secrets = {}
  const secretJson = JSON.parse(secretString)
  Object.assign(secrets, secretJson)

  return secrets as T
}
