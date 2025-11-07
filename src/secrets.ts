import { SecretsManagerClient, GetSecretValueCommand, ResourceNotFoundException } from "@aws-sdk/client-secrets-manager"
import logger from "./logger.js"

export interface LoadSecretsOptions {
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
 * const secrets = await loadSecrets<MySecrets>("my-app/secrets", {
 *   region: "us-east-1",
 * })
 * ```
 */
export async function loadSecrets<T extends Secrets = Secrets>(
  secretName: string,
  options?: LoadSecretsOptions
): Promise<T> {
  if (!secretName) {
    throw new Error("loadSecrets requires a non-empty secretName")
  }

  const region = options?.region || process.env.AWS_REGION || "eu-central-1"

  const client = new SecretsManagerClient({ region })

  let secretString: string

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

  const secrets: Secrets = {}
  const secretJson = JSON.parse(secretString)
  Object.assign(secrets, secretJson)

  return secrets as T
}
