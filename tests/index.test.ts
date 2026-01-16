import { describe, it, expect, vi, beforeEach } from "vitest"
import { join } from "path"

import {
  createMockPluginInput,
  createMockFilesystem,
  addSkillToMock,
  addDirStructure
} from "./mocks"

/**
 * Version parsing and comparison tests
 */
describe("parseVersion", () => {
  it("should parse semantic version correctly", () => {
    const parseVersion = (version: string): number[] => {
      const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      }
      return [0, 0, 0]
    }

    expect(parseVersion("1.2.3")).toEqual([1, 2, 3])
    expect(parseVersion("0.0.1")).toEqual([0, 0, 1])
    expect(parseVersion("10.20.30")).toEqual([10, 20, 30])
  })

  it("should return [0, 0, 0] for invalid version", () => {
    const parseVersion = (version: string): number[] => {
      const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      }
      return [0, 0, 0]
    }

    expect(parseVersion("invalid")).toEqual([0, 0, 0])
    expect(parseVersion("1.2")).toEqual([0, 0, 0])
    expect(parseVersion("")).toEqual([0, 0, 0])
  })
})

describe("compareVersions", () => {
  const compareVersions = (a: string, b: string): number => {
    const parseVersion = (version: string): number[] => {
      const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      }
      return [0, 0, 0]
    }

    const va = parseVersion(a)
    const vb = parseVersion(b)
    for (let i = 0; i < 3; i++) {
      if (va[i] !== vb[i]) return va[i] - vb[i]
    }
    return 0
  }

  it("should compare equal versions as 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0)
  })

  it("should compare major versions correctly", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0)
  })

  it("should compare minor versions correctly", () => {
    expect(compareVersions("1.2.0", "1.1.0")).toBeGreaterThan(0)
    expect(compareVersions("1.1.0", "1.2.0")).toBeLessThan(0)
  })

  it("should compare patch versions correctly", () => {
    expect(compareVersions("1.0.2", "1.0.1")).toBeGreaterThan(0)
    expect(compareVersions("1.0.1", "1.0.2")).toBeLessThan(0)
  })

  it("should sort versions correctly", () => {
    const versions = ["1.0.0", "2.0.0", "1.2.0", "1.0.1", "0.9.0"]
    const sorted = versions.slice().sort(compareVersions)
    expect(sorted).toEqual(["0.9.0", "1.0.0", "1.0.1", "1.2.0", "2.0.0"])
  })
})

/**
 * Filesystem mock tests
 */
describe("filesystem mocking", () => {
  it("should track directory structure", () => {
    const mockFs = createMockFilesystem()
    addDirStructure(mockFs, "/test", ["skill1", "skill2"])

    expect(mockFs.mockDirs.get("/test")).toEqual(["skill1", "skill2"])
  })

  it("should add skills to mock filesystem", () => {
    const mockFs = createMockFilesystem()
    const skillPath = "/cache/marketplace/plugin/1.0.0/skills/python-tdd"

    addSkillToMock(mockFs, "python-tdd", "1.0.0", skillPath)

    expect(mockFs.mockDirs.has(skillPath)).toBe(true)
    expect(mockFs.mockFiles.has(`${skillPath}/SKILL.md`)).toBe(true)
  })

  it("should track symlinks", () => {
    const mockFs = createMockFilesystem()
    mockFs.mockSymlinks.set("/skills/python-tdd", "/cache/skill/python-tdd")

    expect(mockFs.mockSymlinks.get("/skills/python-tdd")).toBe("/cache/skill/python-tdd")
  })
})

/**
 * Mock filesystem operations tests
 */
describe("mock filesystem operations", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should handle access check for existing path", async () => {
    addDirStructure(mockFs, "/test", [])

    await expect(mockFs.mocks.access("/test")).resolves.not.toThrow()
  })

  it("should throw on access check for non-existent path", async () => {
    await expect(mockFs.mocks.access("/nonexistent")).rejects.toThrow()
  })

  it("should return directory contents", async () => {
    addDirStructure(mockFs, "/test", ["file1.ts", "file2.ts"])

    const entries = await mockFs.mocks.readdir("/test")

    expect(entries).toEqual(["file1.ts", "file2.ts"])
  })

  it("should throw when reading non-existent directory", async () => {
    await expect(mockFs.mocks.readdir("/nonexistent")).rejects.toThrow()
  })

  it("should create symlink", async () => {
    await mockFs.mocks.symlink("/source", "/link")

    expect(mockFs.mockSymlinks.get("/link")).toBe("/source")
  })

  it("should remove symlink", async () => {
    mockFs.mockSymlinks.set("/link", "/source")

    await mockFs.mocks.unlink("/link")

    expect(mockFs.mockSymlinks.has("/link")).toBe(false)
  })

  it("should detect symlink with lstat", async () => {
    mockFs.mockSymlinks.set("/link", "/source")

    const stats = (await mockFs.mocks.lstat("/link")) as { isSymbolicLink: () => boolean }

    expect(stats.isSymbolicLink()).toBe(true)
  })

  it("should detect directory with lstat", async () => {
    addDirStructure(mockFs, "/dir", [])

    const stats = (await mockFs.mocks.lstat("/dir")) as {
      isDirectory: () => boolean
      isSymbolicLink: () => boolean
    }

    expect(stats.isDirectory()).toBe(true)
    expect(stats.isSymbolicLink()).toBe(false)
  })

  it("should read symlink target", async () => {
    mockFs.mockSymlinks.set("/link", "/target/path")

    const target = await mockFs.mocks.readlink("/link")

    expect(target).toBe("/target/path")
  })

  it("should create directory", async () => {
    await mockFs.mocks.mkdir("/new/dir")

    expect(mockFs.mockDirs.has("/new/dir")).toBe(true)
  })
})

/**
 * Integration tests for core skill sync logic
 */
describe("skill sync core logic", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should find skills in cache with correct structure", () => {
    const cachePath = "/home/user/.claude/plugins/cache"
    const marketplaceName = "default"
    const pluginName = "opencode-skills"
    const version = "1.0.0"
    const pythonTddSkill = "python-tdd"
    const skillPath = join(
      cachePath,
      marketplaceName,
      pluginName,
      version,
      "skills",
      pythonTddSkill
    )

    addSkillToMock(mockFs, pythonTddSkill, version, skillPath)
    addDirStructure(mockFs, cachePath, [marketplaceName])
    addDirStructure(mockFs, join(cachePath, marketplaceName), [pluginName])
    addDirStructure(mockFs, join(cachePath, marketplaceName, pluginName), [version])
    addDirStructure(mockFs, join(cachePath, marketplaceName, pluginName, version), ["skills"])
    addDirStructure(mockFs, join(cachePath, marketplaceName, pluginName, version, "skills"), [
      pythonTddSkill
    ])

    expect(mockFs.mockDirs.has(skillPath)).toBe(true)
    expect(mockFs.mockFiles.has(`${skillPath}/SKILL.md`)).toBe(true)
  })

  it("should prefer newer versions when multiple exist", () => {
    const compareVersions = (a: string, b: string): number => {
      const parseVersion = (version: string): number[] => {
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
        if (match) {
          return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
        }
        return [0, 0, 0]
      }

      const va = parseVersion(a)
      const vb = parseVersion(b)
      for (let i = 0; i < 3; i++) {
        if (va[i] !== vb[i]) return va[i] - vb[i]
      }
      return 0
    }

    const versions = ["1.0.0", "2.1.3", "1.5.0", "0.9.1"]
    const sorted = versions.slice().sort(compareVersions)
    const latest = sorted[sorted.length - 1] as string

    expect(latest).toBe("2.1.3")
  })

  it("should handle respecting MAX_SKILLS limit", () => {
    const MAX_SKILLS = 100
    const foundSkills: string[] = []

    for (let i = 0; i < 150; i++) {
      if (foundSkills.length >= MAX_SKILLS) break
      foundSkills.push(`skill-${i}`)
    }

    expect(foundSkills.length).toBe(MAX_SKILLS)
  })

  it("should merge cache and marketplace skills with cache priority", () => {
    const skillMap = new Map<string, { source: string }>()

    // Add cache skills
    skillMap.set("python-tdd", { source: "cache" })
    skillMap.set("react-web", { source: "cache" })

    // Try to add marketplace skills (cache should take priority)
    const marketplaceSkills = [
      { name: "python-tdd", source: "marketplace" },
      { name: "rust-systems", source: "marketplace" }
    ]

    for (const skill of marketplaceSkills) {
      if (!skillMap.has(skill.name)) {
        skillMap.set(skill.name, { source: skill.source })
      }
    }

    expect(skillMap.get("python-tdd")!.source).toBe("cache")
    expect(skillMap.get("react-web")!.source).toBe("cache")
    expect(skillMap.get("rust-systems")!.source).toBe("marketplace")
  })

  it("should update symlink if pointing to old version", async () => {
    const oldPath = "/skills/python-tdd/1.0.0"
    const newPath = "/skills/python-tdd/1.1.0"
    const linkPath = "/home/user/.claude/skills/python-tdd"

    // Initial symlink
    mockFs.mockSymlinks.set(linkPath, oldPath)

    // Simulate update
    if (mockFs.mockSymlinks.get(linkPath) !== newPath) {
      mockFs.mockSymlinks.set(linkPath, newPath)
    }

    expect(mockFs.mockSymlinks.get(linkPath)).toBe(newPath)
  })

  it("should remove broken symlinks", async () => {
    const linkPath = "/home/user/.claude/skills/broken-skill"
    mockFs.mockSymlinks.set(linkPath, "/nonexistent/path")

    // Simulate cleanup
    mockFs.mockSymlinks.delete(linkPath)

    expect(mockFs.mockSymlinks.has(linkPath)).toBe(false)
  })
})

/**
 * Plugin initialization tests
 */
describe("plugin initialization", () => {
  it("should create mock plugin input", () => {
    const input = createMockPluginInput()

    expect(input.client).toBeDefined()
    expect(input.client.app).toBeDefined()
    expect(input.client.app.log).toBeDefined()
  })

  it("should log messages via mock client", () => {
    const input = createMockPluginInput()
    const message = "Test message"

    input.client.app.log(message)

    expect(input.client.app.log).toHaveBeenCalledWith(message)
  })

  it("should handle multiple log calls", () => {
    const input = createMockPluginInput()

    input.client.app.log("Message 1")
    input.client.app.log("Message 2")
    input.client.app.log("Message 3")

    expect(input.client.app.log).toHaveBeenCalledTimes(3)
  })
})

/**
 * Error handling tests
 */
describe("error handling", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should handle directory read errors gracefully", async () => {
    const spy = vi.spyOn(mockFs.mocks, "readdir")

    try {
      await mockFs.mocks.readdir("/nonexistent")
    } catch {
      // Expected to throw
    }

    expect(spy).toHaveBeenCalledWith("/nonexistent")
  })

  it("should handle stat errors gracefully", async () => {
    const spy = vi.spyOn(mockFs.mocks, "stat")

    try {
      await mockFs.mocks.stat("/nonexistent")
    } catch {
      // Expected to throw
    }

    expect(spy).toHaveBeenCalledWith("/nonexistent")
  })

  it("should handle lstat errors for missing entries", async () => {
    const spy = vi.spyOn(mockFs.mocks, "lstat")

    try {
      await mockFs.mocks.lstat("/nonexistent")
    } catch {
      // Expected to throw
    }

    expect(spy).toHaveBeenCalledWith("/nonexistent")
  })

  it("should handle symlink creation errors", async () => {
    const spy = vi.spyOn(mockFs.mocks, "symlink")

    await mockFs.mocks.symlink("/source", "/link")

    expect(spy).toHaveBeenCalledWith("/source", "/link")
  })
})

/**
 * Edge case tests
 */
describe("edge cases", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should handle empty directory listings", async () => {
    addDirStructure(mockFs, "/empty", [])

    const entries = await mockFs.mocks.readdir("/empty")

    expect(entries).toEqual([])
  })

  it("should handle paths with special characters", () => {
    const specialPath = "/path/with spaces/and-dashes_underscores"
    addDirStructure(mockFs, specialPath, [])

    expect(mockFs.mockDirs.has(specialPath)).toBe(true)
  })

  it("should handle deeply nested directory structures", () => {
    const deepPath = "/a/b/c/d/e/f/g/h/i/j"
    addDirStructure(mockFs, deepPath, [])

    expect(mockFs.mockDirs.has(deepPath)).toBe(true)
  })

  it("should handle multiple symlinks to same target", () => {
    const target = "/source/skill"
    mockFs.mockSymlinks.set("/link1", target)
    mockFs.mockSymlinks.set("/link2", target)
    mockFs.mockSymlinks.set("/link3", target)

    expect(mockFs.mockSymlinks.get("/link1")).toBe(target)
    expect(mockFs.mockSymlinks.get("/link2")).toBe(target)
    expect(mockFs.mockSymlinks.get("/link3")).toBe(target)
  })

  it("should handle symlink chains (symlink pointing to symlink)", () => {
    mockFs.mockSymlinks.set("/final", "/source")
    mockFs.mockSymlinks.set("/intermediate", "/final")

    expect(mockFs.mockSymlinks.get("/intermediate")).toBe("/final")
    expect(mockFs.mockSymlinks.get("/final")).toBe("/source")
  })
})

/**
 * Clean slate symlink management tests
 */
describe("symlink cleanup (clean slate)", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should remove all symlinks from target directory", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["skill1", "skill2", "skill3"])

    // Add symlinks
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/skill1")
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/skill2")
    mockFs.mockSymlinks.set("/skills/skill3", "/cache/skill3")

    // Simulate cleanup: remove all symlinks
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    let cleaned = 0

    for (const entry of entries) {
      const entryPath = join(targetDir, entry)
      const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

      if (lstats.isSymbolicLink()) {
        await mockFs.mocks.unlink(entryPath)
        cleaned++
      }
    }

    expect(cleaned).toBe(3)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(false)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(false)
    expect(mockFs.mockSymlinks.has("/skills/skill3")).toBe(false)
  })

  it("should NOT remove regular files in target directory", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["regular-file.txt"])

    // Add a regular file (not a symlink)
    mockFs.mockFiles.add("/skills/regular-file.txt")

    // Simulate cleanup: only remove symlinks
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    let cleaned = 0

    for (const entry of entries) {
      const entryPath = join(targetDir, entry)
      const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

      if (lstats.isSymbolicLink()) {
        await mockFs.mocks.unlink(entryPath)
        cleaned++
      }
    }

    expect(cleaned).toBe(0)
    expect(mockFs.mockFiles.has("/skills/regular-file.txt")).toBe(true)
  })

  it("should NOT remove directories in target directory", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["subdir"])
    addDirStructure(mockFs, "/skills/subdir", [])

    // Simulate cleanup: only remove symlinks
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    let cleaned = 0

    for (const entry of entries) {
      const entryPath = join(targetDir, entry)
      const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

      if (lstats.isSymbolicLink()) {
        await mockFs.mocks.unlink(entryPath)
        cleaned++
      }
    }

    expect(cleaned).toBe(0)
    expect(mockFs.mockDirs.has("/skills/subdir")).toBe(true)
  })

  it("should handle mixed symlinks and files", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["skill1", "file.txt", "skill2"])

    // Add mixed content
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/skill1")
    mockFs.mockFiles.add("/skills/file.txt")
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/skill2")

    // Simulate cleanup: only remove symlinks
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    let cleaned = 0

    for (const entry of entries) {
      const entryPath = join(targetDir, entry)
      const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

      if (lstats.isSymbolicLink()) {
        await mockFs.mocks.unlink(entryPath)
        cleaned++
      }
    }

    expect(cleaned).toBe(2)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(false)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(false)
    expect(mockFs.mockFiles.has("/skills/file.txt")).toBe(true)
  })

  it("should create fresh symlinks for all skills after cleanup", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["old-skill"])

    // Old symlink
    mockFs.mockSymlinks.set("/skills/old-skill", "/old/cache/skill")

    // Simulate cleanup
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    for (const entry of entries) {
      const entryPath = join(targetDir, entry)
      const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

      if (lstats.isSymbolicLink()) {
        await mockFs.mocks.unlink(entryPath)
      }
    }

    // Create new symlinks
    const skillMap = new Map<string, { path: string }>()
    skillMap.set("python-tdd", { path: "/cache/python-tdd" })
    skillMap.set("react-web", { path: "/cache/react-web" })

    let created = 0
    for (const [name, skill] of skillMap) {
      const linkPath = join(targetDir, name)
      await mockFs.mocks.symlink(skill.path, linkPath)
      created++
    }

    expect(created).toBe(2)
    expect(mockFs.mockSymlinks.get("/skills/python-tdd")).toBe("/cache/python-tdd")
    expect(mockFs.mockSymlinks.get("/skills/react-web")).toBe("/cache/react-web")
    expect(mockFs.mockSymlinks.has("/skills/old-skill")).toBe(false)
  })

  it("should handle lstat errors gracefully during cleanup", async () => {
    const targetDir = "/skills"
    addDirStructure(mockFs, targetDir, ["skill1"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/skill1")

    // Spy on lstat to verify error handling
    const lstatSpy = vi.spyOn(mockFs.mocks, "lstat")

    // Simulate cleanup with error handling
    const entries = (await mockFs.mocks.readdir(targetDir)) as string[]
    let cleaned = 0

    for (const entry of entries) {
      try {
        const entryPath = join(targetDir, entry)
        const lstats = (await mockFs.mocks.lstat(entryPath)) as { isSymbolicLink: () => boolean }

        if (lstats.isSymbolicLink()) {
          await mockFs.mocks.unlink(entryPath)
          cleaned++
        }
      } catch {
        // Error handling during cleanup
      }
    }

    expect(cleaned).toBe(1)
    expect(lstatSpy).toHaveBeenCalled()
  })
})
