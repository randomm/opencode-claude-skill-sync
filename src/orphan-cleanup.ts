import { join, resolve, dirname } from "path"

/**
 * Extracts plugin name from symlink target path.
 *
 * Supports two path formats:
 * - Cache: `/cache/{marketplace}/{plugin}/{version}/skills/{skill}` → `{plugin}@{marketplace}`
 * - Marketplace: `/marketplaces/{marketplace}/plugins/{plugin}/` → `{plugin}@{marketplace}`
 *
 * @param path - Symlink target path
 * @returns Plugin name in format `{plugin}@{marketplace}` or null if unparseable
 */
export function extractPluginNameFromPath(path: string): string | null {
  // Normalize path - remove trailing slashes and handle both forward/backward slashes
  const normalizedPath = path.replace(/[\\/]+$/, "").replace(/\\/g, "/")

  // Try cache format: /cache/{marketplace}/{plugin}/{version}/skills/{skill}
  const cacheMatch = normalizedPath.match(/(?:^|\/)cache\/([^/]+)\/([^/]+)\/[^/]*\/skills\//)
  if (cacheMatch) {
    const marketplace = cacheMatch[1]
    const plugin = cacheMatch[2]
    return `${plugin}@${marketplace}`
  }

  // Try marketplace plugins format: /marketplaces/{marketplace}/plugins/{plugin}/
  const marketplaceMatch = normalizedPath.match(
    /(?:^|\/)marketplaces\/([^/]+)\/plugins\/([^/]+)(?:\/|$)/
  )
  if (marketplaceMatch) {
    const marketplace = marketplaceMatch[1]
    const plugin = marketplaceMatch[2]
    return `${plugin}@${marketplace}`
  }

  // Try marketplace direct skills format: /marketplaces/{marketplace}/skills/
  const directSkillsMatch = normalizedPath.match(/(?:^|\/)marketplaces\/([^/]+)\/skills\//)
  if (directSkillsMatch) {
    const marketplace = directSkillsMatch[1]
    return `${marketplace}@${marketplace}` // Fallback: use marketplace name as both plugin and marketplace
  }

  // Could not parse path
  return null
}

/**
 * InstallePlugins JSON interface
 */
interface InstalledPluginsManifest {
  version: number
  plugins: Record<string, unknown>
}

/**
 * Reads installed plugins from JSON content.
 *
 * @param content - JSON string from installed_plugins.json
 * @returns Set of plugin keys, or null if parse fails
 */
export function readInstalledPlugins(content: string): Set<string> | null {
  try {
    const parsed = JSON.parse(content) as unknown

    // Validate basic structure
    if (!parsed || typeof parsed !== "object") {
      return null
    }

    const manifest = parsed as InstalledPluginsManifest

    // Check if plugins key exists and is an object (not array, not null, not primitive)
    if (
      !manifest.plugins ||
      typeof manifest.plugins !== "object" ||
      Array.isArray(manifest.plugins)
    ) {
      return null
    }

    // Extract plugin keys
    const pluginKeys = Object.keys(manifest.plugins)
    return new Set(pluginKeys)
  } catch {
    // JSON parse error or structure validation failed
    return null
  }
}

/**
 * Filesystem interface for testing
 */
export interface FSOperations {
  readdir: (path: string) => Promise<string[]>
  lstat: (path: string) => Promise<{ isDirectory: () => boolean; isSymbolicLink: () => boolean }>
  readlink: (path: string) => Promise<string>
  unlink: (path: string) => Promise<void>
}

/**
 * Cleans up orphaned symlinks from uninstalled plugins.
 *
 * @param targetDir - Directory containing symlinks to clean
 * @param installedPlugins - Set of installed plugin keys
 * @param fs - Filesystem operations (allows mocking for tests)
 * @returns Number of symlinks removed
 */
export async function cleanupOrphanedSymlinks(
  targetDir: string,
  installedPlugins: Set<string>,
  fs: FSOperations
): Promise<number> {
  let removed = 0

  try {
    const entries = await fs.readdir(targetDir)

    for (const entry of entries) {
      try {
        const entryPath = join(targetDir, entry)
        const stats = await fs.lstat(entryPath)

        // Only process symlinks, skip regular files and directories
        if (!stats.isSymbolicLink()) {
          continue
        }

        // Read the symlink target to extract plugin name
        const rawTargetPath = await fs.readlink(entryPath)
        // Normalize relative symlinks: resolve against the symlink's directory
        const normalizedPath =
          rawTargetPath.startsWith("/") || rawTargetPath.match(/^[A-Za-z]:/)
            ? rawTargetPath
            : resolve(dirname(entryPath), rawTargetPath)
        const pluginName = extractPluginNameFromPath(normalizedPath)

        // Remove orphaned symlinks where plugin is not installed
        if (pluginName === null || !installedPlugins.has(pluginName)) {
          await fs.unlink(entryPath)
          removed++
        }
      } catch {
        // Skip individual entry errors (e.g., broken symlinks, readlink failures)
        continue
      }
    }
  } catch {
    // If directory read fails, return 0 (fail safe)
    return 0
  }

  return removed
}
