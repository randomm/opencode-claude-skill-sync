import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import {
  access,
  constants,
  lstat,
  readdir,
  readlink,
  mkdir,
  symlink,
  unlink,
  stat
} from "fs/promises"
import { join } from "path"
import { homedir } from "os"

const MAX_SKILLS = 100 // Hard limit to prevent overwhelming the system

interface SkillInfo {
  name: string
  path: string
  version: string
  source: "cache" | "marketplaces"
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

function parseVersion(version: string): number[] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
  }
  return [0, 0, 0]
}

function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i]
  }
  return 0
}

async function findSkillsInCache(cacheDir: string, limit: number): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = []

  try {
    if (!(await exists(cacheDir))) return skills

    const marketplaces = await readdir(cacheDir)

    for (const marketplace of marketplaces) {
      if (skills.length >= limit) break

      const marketplacePath = join(cacheDir, marketplace)
      if (!(await isDirectory(marketplacePath))) continue

      let plugins: string[]
      try {
        plugins = await readdir(marketplacePath)
      } catch {
        continue
      }

      for (const plugin of plugins) {
        if (skills.length >= limit) break

        const pluginPath = join(marketplacePath, plugin)
        if (!(await isDirectory(pluginPath))) continue

        let versionEntries: string[]
        try {
          versionEntries = await readdir(pluginPath)
        } catch {
          continue
        }

        const versions: string[] = []
        for (const v of versionEntries) {
          if (await isDirectory(join(pluginPath, v))) {
            versions.push(v)
          }
        }

        if (versions.length === 0) continue

        versions.sort(compareVersions)
        const latestVersion = versions[versions.length - 1]
        const skillsDir = join(pluginPath, latestVersion, "skills")

        if (!(await exists(skillsDir))) continue

        let skillNames: string[]
        try {
          skillNames = await readdir(skillsDir)
        } catch {
          continue
        }

        for (const skillName of skillNames) {
          if (skills.length >= limit) break

          const skillPath = join(skillsDir, skillName)
          const skillMdPath = join(skillPath, "SKILL.md")

          if ((await isDirectory(skillPath)) && (await exists(skillMdPath))) {
            skills.push({
              name: skillName,
              path: skillPath,
              version: latestVersion,
              source: "cache"
            })
          }
        }
      }
    }
  } catch (err) {
    console.error("[claude-skill-sync] Error finding skills in cache:", err)
  }

  return skills
}

async function findSkillsInMarketplaces(
  marketplacesDir: string,
  limit: number
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = []

  try {
    if (!(await exists(marketplacesDir))) return skills

    const marketplaces = await readdir(marketplacesDir)

    for (const marketplace of marketplaces) {
      if (skills.length >= limit) break

      const marketplacePath = join(marketplacesDir, marketplace)
      if (!(await isDirectory(marketplacePath))) continue

      // Check for plugins subdirectory
      const pluginsDir = join(marketplacePath, "plugins")
      if ((await exists(pluginsDir)) && (await isDirectory(pluginsDir))) {
        let plugins: string[]
        try {
          plugins = await readdir(pluginsDir)
        } catch {
          continue
        }

        for (const plugin of plugins) {
          if (skills.length >= limit) break

          const pluginPath = join(pluginsDir, plugin)
          if (!(await isDirectory(pluginPath))) continue

          const skillsDir = join(pluginPath, "skills")
          if (!(await exists(skillsDir))) continue

          let skillNames: string[]
          try {
            skillNames = await readdir(skillsDir)
          } catch {
            continue
          }

          for (const skillName of skillNames) {
            if (skills.length >= limit) break

            const skillPath = join(skillsDir, skillName)
            const skillMdPath = join(skillPath, "SKILL.md")

            if ((await isDirectory(skillPath)) && (await exists(skillMdPath))) {
              skills.push({
                name: skillName,
                path: skillPath,
                version: "latest",
                source: "marketplaces"
              })
            }
          }
        }
      }

      // Check for direct skills directory
      const directSkillsDir = join(marketplacePath, "skills")
      if ((await exists(directSkillsDir)) && (await isDirectory(directSkillsDir))) {
        let skillNames: string[]
        try {
          skillNames = await readdir(directSkillsDir)
        } catch {
          continue
        }

        for (const skillName of skillNames) {
          if (skills.length >= limit) break

          const skillPath = join(directSkillsDir, skillName)
          const skillMdPath = join(skillPath, "SKILL.md")

          if ((await isDirectory(skillPath)) && (await exists(skillMdPath))) {
            skills.push({
              name: skillName,
              path: skillPath,
              version: "latest",
              source: "marketplaces"
            })
          }
        }
      }
    }
  } catch (err) {
    console.error("[claude-skill-sync] Error finding skills in marketplaces:", err)
  }

  return skills
}

async function syncSkills(client: PluginInput["client"]): Promise<void> {
  const home = homedir()
  const claudeDir = join(home, ".claude")
  const opencodeDir = join(home, ".config", "opencode")
  const cacheDir = join(claudeDir, "plugins", "cache")
  const marketplacesDir = join(claudeDir, "plugins", "marketplaces")
  const targetDir = join(opencodeDir, "skill")

  try {
    // Check if Claude directory exists (required for plugin cache/marketplaces)
    if (!(await exists(claudeDir))) {
      (client as unknown as { app: { log: (msg: string) => void } }).app.log(
        "Claude Code not installed, skipping"
      )
      return
    }

    // Find skills from cache first (higher priority), then marketplaces
    const cacheSkills = await findSkillsInCache(cacheDir, MAX_SKILLS)
    const remainingLimit = MAX_SKILLS - cacheSkills.length
    const marketplaceSkills =
      remainingLimit > 0 ? await findSkillsInMarketplaces(marketplacesDir, remainingLimit) : []

    // Merge skills, cache takes priority
    const skillMap = new Map<string, SkillInfo>()

    for (const skill of cacheSkills) {
      skillMap.set(skill.name, skill)
    }

    for (const skill of marketplaceSkills) {
      if (!skillMap.has(skill.name)) {
        skillMap.set(skill.name, skill)
      }
    }

    const totalFound = skillMap.size

    if (totalFound === 0) {
      (client as unknown as { app: { log: (msg: string) => void } }).app.log("No skills found")
      return
    }

    // Create target directory if missing
    if (!(await exists(targetDir))) {
      await mkdir(targetDir, { recursive: true })
    }

    // Clean existing symlinks
    let cleaned = 0
    let updated = 0
    let created = 0

    if (await exists(targetDir)) {
      const entries = await readdir(targetDir)

      for (const entry of entries) {
        try {
          const entryPath = join(targetDir, entry)
          const lstats = await lstat(entryPath)

          if (lstats.isSymbolicLink()) {
            const target = await readlink(entryPath)
            const skill = skillMap.get(entry)

            // Remove broken or stale symlinks
            const targetExists = await exists(entryPath)
            if (!targetExists || !skill) {
              await unlink(entryPath)
              cleaned++
              if (skill) skillMap.delete(entry)
              continue
            }

            // Update if pointing to old version
            if (target !== skill.path) {
              await unlink(entryPath)
              await symlink(skill.path, entryPath)
              updated++
            }

            skillMap.delete(entry)
          }
        } catch {
          // Skip problematic entries
        }
      }
    }

    // Create new symlinks
    for (const [name, skill] of skillMap) {
      try {
        const linkPath = join(targetDir, name)
        await symlink(skill.path, linkPath)
        created++
      } catch {
        // Skip if symlink creation fails
      }
    }

    (client as unknown as { app: { log: (msg: string) => void } }).app.log(
      `Synced ${totalFound} skills (limit: ${MAX_SKILLS}): ` +
        `${created} created, ${updated} updated, ${cleaned} cleaned`
    )
  } catch (err) {
    console.error("[claude-skill-sync] Sync failed:", err)
  }
}

/**
 * Claude Skill Sync Plugin
 *
 * Automatically discovers and syncs OpenCode plugin skills to the OpenCode
 * ~/.config/opencode/skill directory via symlinks. Runs asynchronously to avoid blocking
 * OpenCode startup.
 *
 * @example
 * ```typescript
 * import { claudeSkillSync } from "@opencode-ai/claude-skill-sync"
 *
 * export default claudeSkillSync
 * ```
 */
export const claudeSkillSync: Plugin = async ({ client }: PluginInput) => {
  // Fire and forget - don't await sync to avoid blocking OpenCode startup
  void syncSkills(client).catch(err => {
    console.error("[claude-skill-sync] Background sync error:", err)
  })

  return {}
}

export default claudeSkillSync
