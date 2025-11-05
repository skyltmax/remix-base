import child_process from "node:child_process"

export const getRevision = () => {
  if (process.env.GIT_REV) return process.env.GIT_REV

  try {
    return child_process.execSync("git rev-parse HEAD").toString().trim()
  } catch (e) {
    console.error("Failed to get revision", e)
    return "unknown"
  }
}
