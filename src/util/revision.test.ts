import child_process from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getRevision } from "./revision.js"

vi.mock("node:child_process")

describe("getRevision", () => {
  let originalGitRev: string | undefined
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalGitRev = process.env.GIT_REV
    delete process.env.GIT_REV
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalGitRev !== undefined) {
      process.env.GIT_REV = originalGitRev
    } else {
      delete process.env.GIT_REV
    }
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  it("should return GIT_REV environment variable if set", () => {
    process.env.GIT_REV = "abc123def456"

    const revision = getRevision()

    expect(revision).toBe("abc123def456")
    expect(child_process.execSync).not.toHaveBeenCalled()
  })

  it("should execute git command when GIT_REV is not set", () => {
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from("1234567890abcdef\n"))

    const revision = getRevision()

    expect(revision).toBe("1234567890abcdef")
    expect(child_process.execSync).toHaveBeenCalledWith("git rev-parse HEAD")
  })

  it("should trim whitespace from git output", () => {
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from("  abc123  \n  "))

    const revision = getRevision()

    expect(revision).toBe("abc123")
  })

  it("should return 'unknown' if git command fails", () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error("Git not found")
    })

    const revision = getRevision()

    expect(revision).toBe("unknown")
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to get revision", expect.any(Error))
  })

  it("should log error when git command fails", () => {
    const error = new Error("Not a git repository")
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw error
    })

    getRevision()

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to get revision", error)
  })

  it("should prefer environment variable over git command", () => {
    process.env.GIT_REV = "env-revision"
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from("git-revision"))

    const revision = getRevision()

    expect(revision).toBe("env-revision")
    expect(child_process.execSync).not.toHaveBeenCalled()
  })
})
