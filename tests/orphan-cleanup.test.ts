import { describe, it, expect, beforeEach, vi } from "vitest"

// Import the functions we'll implement
import {
  extractPluginNameFromPath,
  readInstalledPlugins,
  cleanupOrphanedSymlinks,
  type FSOperations
} from "../src/orphan-cleanup"

// Reuse mock helpers from existing tests
import { createMockFilesystem, addDirStructure, type MockFSMethods } from "./mocks"

describe("extractPluginNameFromPath", () => {
  it("should extract plugin name from cache symlink path", () => {
    const cachePath =
      "/cache/claude-plugins-official/backend-development/e30768372b41/skills/python-tdd"
    const result = extractPluginNameFromPath(cachePath)
    expect(result).toBe("backend-development@claude-plugins-official")
  })

  it("should extract plugin name from marketplace plugins path", () => {
    const marketplacePath =
      "/marketplaces/claude-code-workflows/plugins/rust-systems/skills/rust-systems"
    const result = extractPluginNameFromPath(marketplacePath)
    expect(result).toBe("rust-systems@claude-code-workflows")
  })

  it("should extract plugin name from direct marketplace skills path", () => {
    const directPath = "/marketplaces/custom-marketplace/skills/global-skill"
    const result = extractPluginNameFromPath(directPath)
    expect(result).toBe("custom-marketplace@custom-marketplace") // Fallback pattern
  })

  it("should return null for unrecognized path format", () => {
    const invalidPath = "/some/random/path/that/doesnt/match/pattern"
    const result = extractPluginNameFromPath(invalidPath)
    expect(result).toBeNull()
  })

  it("should handle relative paths", () => {
    const relativePath = "cache/marketplace/plugin/version/skills/skill"
    const result = extractPluginNameFromPath(relativePath)
    expect(result).toBe("plugin@marketplace")
  })

  it("should handle paths with trailing slashes", () => {
    const trailingPath = "/cache/marketplace/plugin/version/skills/skill/"
    const result = extractPluginNameFromPath(trailingPath)
    expect(result).toBe("plugin@marketplace")
  })

  it("should handle marketplace plugins path with trailing slash", () => {
    const trailingPath = "/marketplaces/some-marketplace/plugins/my-plugin/skills/skill/"
    const result = extractPluginNameFromPath(trailingPath)
    expect(result).toBe("my-plugin@some-marketplace")
  })

  // CRITICAL FIX #3: Test for empty/whitespace edge cases
  it("should return null for path with empty plugin name", () => {
    const emptyPluginPath = "/cache/marketplace//version/skills/skill"
    const result = extractPluginNameFromPath(emptyPluginPath)
    expect(result).toBeNull()
  })
})

describe("readInstalledPlugins", () => {
  it("should parse valid installed_plugins.json", () => {
    const mockContent = JSON.stringify({
      version: 2,
      plugins: {
        "plugin1@marketplace1": [],
        "plugin2@marketplace2": []
      }
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toEqual(new Set(["plugin1@marketplace1", "plugin2@marketplace2"]))
  })

  it("should return empty set for empty plugins object", () => {
    const mockContent = JSON.stringify({
      version: 2,
      plugins: {}
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toEqual(new Set())
  })

  it("should handle malformed JSON gracefully", () => {
    const invalidContent = "{ invalid json"
    const result = readInstalledPlugins(invalidContent)
    expect(result).toBeNull()
  })

  it("should handle plugins key missing", () => {
    const mockContent = JSON.stringify({
      version: 2
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toBeNull()
  })

  it("should handle plugins not being an object", () => {
    const mockContent = JSON.stringify({
      version: 2,
      plugins: "not-an-object"
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toBeNull()
  })

  it("should handle additional properties in plugins object", () => {
    const mockContent = JSON.stringify({
      version: 2,
      plugins: {
        "plugin1@marketplace1": [],
        "plugin2@marketplace2": []
      },
      someOtherProperty: "value"
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toEqual(new Set(["plugin1@marketplace1", "plugin2@marketplace2"]))
  })

  it("should handle large number of plugins", () => {
    const plugins: Record<string, unknown> = {}
    const expectedKeys: string[] = []

    for (let i = 0; i < 100; i++) {
      const key = `plugin-${i}@marketplace-${i % 10}`
      plugins[key] = []
      expectedKeys.push(key)
    }

    const mockContent = JSON.stringify({
      version: 2,
      plugins
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toEqual(new Set(expectedKeys))
    expect(result!.size).toBe(100)
  })

  it("should handle plugins as array instead of object", () => {
    // CRITICAL FIX #1: Array should be rejected
    const mockContent = JSON.stringify({
      version: 2,
      plugins: ["plugin1@marketplace1", "plugin2@marketplace2"]
    })

    const result = readInstalledPlugins(mockContent)
    expect(result).toBeNull() // Arrays should be rejected
  })
})

describe("cleanupOrphanedSymlinks", () => {
  let mockFs: ReturnType<typeof createMockFilesystem>

  // Helper to create FSOperations from MockFSMethods
  function createFSOperationsFromMocks(mocks: MockFSMethods): FSOperations {
    return {
      readdir: (path: string) => mocks.readdir(path) as Promise<string[]>,
      lstat: (path: string) =>
        mocks.lstat(path) as Promise<{ isDirectory: () => boolean; isSymbolicLink: () => boolean }>,
      readlink: (path: string) => mocks.readlink(path) as Promise<string>,
      unlink: (path: string) => mocks.unlink(path) as Promise<void>
    }
  }

  beforeEach(() => {
    mockFs = createMockFilesystem()
  })

  it("should remove orphaned symlinks from uninstalled plugins", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1", "plugin2@marketplace2"])

    // Setup: symlinks from installed and uninstalled plugins
    addDirStructure(mockFs, targetDir, ["skill1", "skill2", "skill3"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1") // installed
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/marketplace2/plugin2/v1/skills/skill2") // installed
    mockFs.mockSymlinks.set("/skills/skill3", "/cache/marketplace3/plugin3/v1/skills/skill3") // orphaned

    // Mock fs calls
    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "skill2", "skill3"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(1)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/skill3")).toBe(false)
  })

  it("should preserve valid symlinks from installed plugins", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1", "skill2"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1") // installed
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/marketplace1/plugin1/v1/skills/skill2") // installed

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "skill2"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(true)
  })

  it("should NOT remove regular files from target directory", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["regular-file.txt"])
    mockFs.mockFiles.add("/skills/regular-file.txt")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["regular-file.txt"])
    vi.mocked(mockFs.mocks.lstat).mockResolvedValue({
      isDirectory: () => false,
      isSymbolicLink: () => false
    } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>)

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0)
    expect(mockFs.mockFiles.has("/skills/regular-file.txt")).toBe(true)
  })

  it("should NOT remove directories from target directory", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["subdir"])
    addDirStructure(mockFs, "/skills/subdir", [])

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["subdir"])
    vi.mocked(mockFs.mocks.lstat).mockResolvedValue({
      isDirectory: () => true,
      isSymbolicLink: () => false
    } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>)

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0)
    expect(mockFs.mockDirs.has("/skills/subdir")).toBe(true)
  })

  it("should handle mixed symlinks and files", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1", "orphan-skill", "file.txt", "subdir"])
    addDirStructure(mockFs, "/skills/subdir", [])

    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")
    mockFs.mockSymlinks.set(
      "/skills/orphan-skill",
      "/cache/marketplace2/plugin2/v1/skills/orphan-skill"
    )
    mockFs.mockFiles.add("/skills/file.txt")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue([
      "skill1",
      "orphan-skill",
      "file.txt",
      "subdir"
    ])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      if (path === "/skills/subdir") {
        return {
          isDirectory: () => true,
          isSymbolicLink: () => false
        } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
      }
      if (path === "/skills/file.txt") {
        return {
          isDirectory: () => false,
          isSymbolicLink: () => false
        } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
      }
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path) || ""
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(1)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/orphan-skill")).toBe(false)
    expect(mockFs.mockFiles.has("/skills/file.txt")).toBe(true)
    expect(mockFs.mockDirs.has("/skills/subdir")).toBe(true)
  })

  it("should handle empty directory", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, [])

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue([])

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0)
  })

  it("should handle empty installed plugins set (remove all symlinks)", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set<string>()

    addDirStructure(mockFs, targetDir, ["skill1", "skill2"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/marketplace2/plugin2/v1/skills/skill2")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "skill2"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(2)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(false)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(false)
  })

  // CRITICAL FIX #3: Test for path traversal handling
  it("should handle relative symlinks with ../ traversal", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1"])
    // Simulate readlink returning a relative path that would point to:
    // /skills/../cache/marketplace1/plugin1/v1/skills/skill1
    // This should normalize to /cache/marketplace1/plugin1/v1/skills/skill1
    mockFs.mockSymlinks.set("/skills/skill1", "../cache/marketplace1/plugin1/v1/skills/skill1")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0) // Should preserve, since normalized path is valid
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
  })

  it("should handle readlink errors gracefully", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1", "skill2"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")
    mockFs.mockSymlinks.set("/skills/skill2", "/cache/marketplace2/plugin2/v1/skills/skill2")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "skill2"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      if (path === "/skills/skill2") {
        throw new Error("ENOENT")
      }
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0) // Should skip unreadable symlinks, not crash
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(true) // Still there
  })

  it("should handle marketplace plugins path format", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["my-plugin@custom-marketplace"])

    addDirStructure(mockFs, targetDir, ["skill1", "skill2"])
    mockFs.mockSymlinks.set(
      "/skills/skill1",
      "/marketplaces/custom-marketplace/plugins/my-plugin/skills/skill1"
    )
    mockFs.mockSymlinks.set(
      "/skills/skill2",
      "/marketplaces/other-marketplace/plugins/other-plugin/skills/skill2"
    )

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "skill2"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(1)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/skill2")).toBe(false)
  })

  it("should handle symlinks with unparseable paths gracefully", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1", "invalid-skill"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")
    mockFs.mockSymlinks.set("/skills/invalid-skill", "/some/random/path")

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "invalid-skill"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })
    vi.mocked(mockFs.mocks.readlink).mockImplementation(async (path: string) => {
      return mockFs.mockSymlinks.get(path)!
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(1)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
    expect(mockFs.mockSymlinks.has("/skills/invalid-skill")).toBe(false)
  })

  it("should handle readdir errors gracefully and return 0", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")

    vi.mocked(mockFs.mocks.readdir).mockRejectedValue(new Error("Directory not readable"))

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    expect(removed).toBe(0)
  })

  it("should handle lstat errors gracefully and skip problematic entries", async () => {
    const targetDir = "/skills"
    const installedPlugins = new Set(["plugin1@marketplace1"])

    addDirStructure(mockFs, targetDir, ["skill1", "problematic"])
    mockFs.mockSymlinks.set("/skills/skill1", "/cache/marketplace1/plugin1/v1/skills/skill1")
    mockFs.mockSymlinks.set(
      "/skills/problematic",
      "/cache/marketplace2/plugin2/v1/skills/problematic"
    )

    vi.mocked(mockFs.mocks.readdir).mockResolvedValue(["skill1", "problematic"])
    vi.mocked(mockFs.mocks.lstat).mockImplementation(async (path: string) => {
      if (path === "/skills/problematic") {
        throw new Error("lstat failed")
      }
      return {
        isDirectory: () => false,
        isSymbolicLink: () => mockFs.mockSymlinks.has(path)
      } as Awaited<ReturnType<typeof mockFs.mocks.lstat>>
    })

    const removed = await cleanupOrphanedSymlinks(
      targetDir,
      installedPlugins,
      createFSOperationsFromMocks(mockFs.mocks)
    )

    // Should skip problematic entry but still process valid ones
    expect(removed).toBe(0)
    expect(mockFs.mockSymlinks.has("/skills/skill1")).toBe(true)
  })
})
