import { GetSecretValueCommand, ResourceNotFoundException, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadSecrets, type Secrets } from "./secrets"

// Mock the AWS SDK
vi.mock("@aws-sdk/client-secrets-manager", () => {
  const mockSend = vi.fn()
  return {
    SecretsManagerClient: vi.fn(() => ({
      send: mockSend,
    })),
    GetSecretValueCommand: vi.fn(),
    ResourceNotFoundException: class ResourceNotFoundException extends Error {
      constructor(message: string) {
        super(message)
        this.name = "ResourceNotFoundException"
      }
    },
  }
})

// Mock the logger
vi.mock("./logger", () => ({
  default: {
    error: vi.fn(),
  },
}))

describe("loadSecrets", () => {
  const mockSend = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the mock implementation
    vi.mocked(SecretsManagerClient).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as SecretsManagerClient
    )
  })

  it("should load secrets successfully", async () => {
    const mockSecrets = { apiKey: "test-key", dbPassword: "secret123" }
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify(mockSecrets),
    })

    const secrets = await loadSecrets()

    expect(secrets).toEqual(mockSecrets)
    expect(SecretsManagerClient).toHaveBeenCalledWith({
      region: "eu-central-1",
    })
    expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand))
  })

  it("should use custom secret name and region", async () => {
    const mockSecrets = { customKey: "value" }
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify(mockSecrets),
    })

    await loadSecrets({
      secretName: "my-app/production",
      region: "us-east-1",
    })

    expect(SecretsManagerClient).toHaveBeenCalledWith({ region: "us-east-1" })
    expect(GetSecretValueCommand).toHaveBeenCalledWith({
      SecretId: "my-app/production",
      VersionStage: "AWSCURRENT",
    })
  })

  it("should use environment variables for secret name and region", async () => {
    process.env.AWS_SECRET_NAME = "env-secret"
    process.env.AWS_REGION = "ap-southeast-1"

    const mockSecrets = { envKey: "envValue" }
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify(mockSecrets),
    })

    await loadSecrets()

    expect(SecretsManagerClient).toHaveBeenCalledWith({
      region: "ap-southeast-1",
    })
    expect(GetSecretValueCommand).toHaveBeenCalledWith({
      SecretId: "env-secret",
      VersionStage: "AWSCURRENT",
    })

    delete process.env.AWS_SECRET_NAME
    delete process.env.AWS_REGION
  })

  it("should return empty object when secret is not found", async () => {
    const notFoundError = new ResourceNotFoundException({
      $metadata: {},
      message: "Secret not found",
    })
    mockSend.mockRejectedValue(notFoundError)

    const secrets = await loadSecrets()

    expect(secrets).toEqual({})
  })

  it("should return empty object in CI environment", async () => {
    process.env.CI = "true"

    const secrets = await loadSecrets()

    expect(secrets).toEqual({})
    expect(mockSend).not.toHaveBeenCalled()

    delete process.env.CI
  })

  it("should handle empty SecretString", async () => {
    mockSend.mockResolvedValue({
      SecretString: undefined,
    })

    const secrets = await loadSecrets()

    expect(secrets).toEqual({})
  })

  it("should throw error for non-ResourceNotFoundException errors", async () => {
    const error = new Error("Network error")
    mockSend.mockRejectedValue(error)

    await expect(loadSecrets()).rejects.toThrow("Network error")
  })

  it("should work with typed secrets", async () => {
    interface MySecrets extends Secrets {
      apiKey: string
      dbPassword: string
    }

    const mockSecrets = { apiKey: "test-key", dbPassword: "secret123" }
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify(mockSecrets),
    })

    const secrets = await loadSecrets<MySecrets>()

    expect(secrets.apiKey).toBe("test-key")
    expect(secrets.dbPassword).toBe("secret123")
  })

  it("should handle JSON with nested objects", async () => {
    const mockSecrets = {
      database: {
        host: "localhost",
        port: 5432,
      },
      api: {
        key: "abc123",
        secret: "xyz789",
      },
    }
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify(mockSecrets),
    })

    const secrets = await loadSecrets()

    expect(secrets).toEqual(mockSecrets)
  })
})
