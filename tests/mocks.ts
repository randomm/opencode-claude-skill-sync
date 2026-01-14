import { vi } from "vitest"
import type { PluginInput } from "@opencode-ai/plugin"

interface MockClient {
  app: {
    log: (msg: string) => void
  }
}

/**
 * Creates a mock PluginInput client for testing
 */
export function createMockPluginInput(): PluginInput & { client: MockClient } {
  return {
    client: {
      app: {
        log: vi.fn()
      }
    }
  } as unknown as PluginInput & { client: MockClient }
}

interface FSError extends Error {
  code: string
}

interface StatResult {
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}

interface MockFSMethods {
  access: ReturnType<typeof vi.fn>
  readdir: ReturnType<typeof vi.fn>
  stat: ReturnType<typeof vi.fn>
  lstat: ReturnType<typeof vi.fn>
  readlink: ReturnType<typeof vi.fn>
  mkdir: ReturnType<typeof vi.fn>
  symlink: ReturnType<typeof vi.fn>
  unlink: ReturnType<typeof vi.fn>
}

/**
 * Creates mock filesystem entries for testing
 * Returns mocks for fs/promises functions
 */
export function createMockFilesystem() {
  const mockDirs = new Map<string, string[]>()
  const mockSymlinks = new Map<string, string>()
  const mockFiles = new Set<string>()

  const createError = (message: string): FSError => {
    const err = new Error(message) as FSError
    err.code = "ENOENT"
    return err
  }

  return {
    mockDirs,
    mockSymlinks,
    mockFiles,
    mocks: {
      access: vi.fn(async (path: string) => {
        const exists = mockDirs.has(path) || mockFiles.has(path)
        if (!exists) {
          throw createError("ENOENT")
        }
      }),

      readdir: vi.fn(async (path: string) => {
        const entries = mockDirs.get(path)
        if (!entries) {
          throw createError("ENOENT")
        }
        return entries
      }),

      stat: vi.fn(async (path: string): Promise<StatResult> => {
        const isDir = mockDirs.has(path)
        if (!isDir && !mockFiles.has(path)) {
          throw createError("ENOENT")
        }
        return {
          isDirectory: () => isDir,
          isSymbolicLink: () => false
        }
      }),

      lstat: vi.fn(async (path: string): Promise<StatResult> => {
        const isSymlink = mockSymlinks.has(path)
        const isDir = mockDirs.has(path)
        if (!isSymlink && !isDir && !mockFiles.has(path)) {
          throw createError("ENOENT")
        }
        return {
          isDirectory: () => isDir && !isSymlink,
          isSymbolicLink: () => isSymlink
        }
      }),

      readlink: vi.fn(async (path: string) => {
        const target = mockSymlinks.get(path)
        if (!target) {
          throw createError("ENOENT")
        }
        return target
      }),

      mkdir: vi.fn(async (path: string) => {
        mockDirs.set(path, [])
      }),

      symlink: vi.fn(async (target: string, path: string) => {
        mockSymlinks.set(path, target)
      }),

      unlink: vi.fn(async (path: string) => {
        mockSymlinks.delete(path)
        mockFiles.delete(path)
      })
    } as MockFSMethods
  }
}

/**
 * Helper to add a skill directory to the mock filesystem
 */
export function addSkillToMock(
  mockFs: ReturnType<typeof createMockFilesystem>,
  skillName: string,
  version: string,
  path: string
): void {
  mockFs.mockDirs.set(path, ["SKILL.md"])
  mockFs.mockFiles.add(`${path}/SKILL.md`)
}

/**
 * Helper to add a directory structure to the mock filesystem
 */
export function addDirStructure(
  mockFs: ReturnType<typeof createMockFilesystem>,
  parentPath: string,
  children: string[]
): void {
  mockFs.mockDirs.set(parentPath, children)
}
