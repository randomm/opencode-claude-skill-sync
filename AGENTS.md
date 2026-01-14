# Development Standards & Workflow

## Coding Quality Standards

### Single Responsibility Principle
- **One function, one purpose**: Each function should do exactly one thing well
- **One class, one reason to change**: Each class encapsulates a single concern
- **Pure functions preferred**: Minimize side effects, maximize testability

### DRY (Don't Repeat Yourself)
- **Extract reusable code into functions**: Reduce duplication immediately
- **Shared utilities go in `/src/utils/`**: Common functionality in one place
- **Use composition over repetition**: Build complex behavior from small pieces

### Code Organization
- **Imports**: Alphabetical order, grouped by source (stdlib → packages → local)
- **Export single responsibility items**: Keep module boundaries clean
- **Avoid circular dependencies**: Maintain clear dependency flow

### Error Handling
- **No error suppression**: Never use `@ts-ignore`, `# noqa`, `# type: ignore`
- **Explicit error handling**: Catch and handle errors at appropriate levels
- **Meaningful error messages**: Include context for debugging

### Type Safety (TypeScript)
- **Precise type hints for public APIs**: All exported functions/classes must be typed
- **Avoid `any` type**: Use specific types or generics instead
- **Type narrowing**: Use typeof checks and discriminated unions

## Workflow: Issue-Driven Development

### Before Writing Code
1. **GitHub issue exists** with clearly defined requirements
2. **Work matches issue content exactly** - no scope creep
3. **Issue includes quality checkboxes** (tests, coverage, linting, type-check)

### Feature Branch Workflow
```bash
# 1. Create feature branch from issue description
git checkout -b feature/issue-description

# 2. Implement changes with tests
# 3. Run quality gates locally (see below)
# 4. Commit and push
```

### Quality Gates (Mandatory Local Execution)

**Before pushing to CI, run ALL quality gates locally:**

```bash
# 1. Run tests
npm run test

# 2. Run type checking
npm run typecheck

# 3. Run linting
npm run lint
```

**All must pass before pushing. No exceptions.**

### Issue Completion Checklist
- [ ] Feature branch created
- [ ] Tests written (before implementation when possible)
- [ ] Code passes all quality gates locally
- [ ] Test coverage 80%+ for new code
- [ ] No type suppressions (`@ts-ignore`, etc.)
- [ ] Linting passes
- [ ] Type checking passes
- [ ] All issue checkboxes completed

## Conventional Commits & Semantic Versioning

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types
- **feat**: New feature (bumps minor version)
- **fix**: Bug fix (bumps patch version)
- **docs**: Documentation changes
- **test**: Test additions or improvements
- **refactor**: Code reorganization (no behavior change)
- **perf**: Performance improvements
- **chore**: Build, dependencies, tooling

### Examples
```
feat(sync): add symlink version comparison logic
fix(cli): resolve permission issues in non-interactive mode
docs: update setup instructions for macOS
test: add filesystem mocking for symlink tests
```

### Semantic Versioning

**Format: `MAJOR.MINOR.PATCH`**
- **MAJOR**: Breaking changes (API modifications)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

**Example progression:**
- v1.0.0 → v1.1.0 (new feature)
- v1.1.0 → v1.1.1 (bug fix)
- v1.1.1 → v2.0.0 (breaking change)

## Minimalist Philosophy

### Pre-Creation Challenge
Before writing ANY code, file, or component, ask:

- ✅ Is this explicitly required by the GitHub issue?
- ✅ Can existing code/tools solve this instead?
- ✅ What's the SIMPLEST way to meet the requirement?
- ✅ Will removing this break core functionality?
- ✅ Am I building for hypothetical future needs?

**If you cannot justify necessity, DO NOT CREATE IT.**

### File Hygiene Standards

**200-PR Litmus Test**: Will this file be useful in 200 PRs?

| File Type | Location | Status |
|-----------|----------|--------|
| Source code | `src/` | ✅ Keep |
| Tests | `tests/` | ✅ Keep |
| Configuration | root (tsconfig, .eslint, prettier) | ✅ Keep |
| CI/CD | `.github/workflows/` | ✅ Keep |
| Debug scripts | Any filename with `debug_` | ❌ Delete |
| Analysis docs | `*_SUMMARY.md`, `NOTES.md` | ❌ Delete |
| Throwaway investigation scripts | One-off bash files | ❌ Delete |

## Code Style Fundamentals

### TypeScript Conventions
- **Imports**: Group and alphabetize (stdlib → packages → local)
  ```typescript
  import type { Plugin } from "@opencode-ai/plugin"
  import { access, mkdir } from "fs/promises"
  import { join } from "path"
  
  import type { Config } from "./types"
  import { parseVersion } from "./utils"
  ```

- **Naming**: Use descriptive names following camelCase
  ```typescript
  // Good
  async function findSkillsInCache(cacheDir: string): Promise<SkillInfo[]>
  
  // Avoid
  async function f(d): Promise<any>
  ```

- **Comments**: Use docstrings for public APIs, inline comments sparingly
  ```typescript
  /**
   * Discovers and syncs skills from cache to target directory.
   * @param cacheDir - Path to plugin cache
   * @returns Array of found skills
   */
  ```

### Test Naming
```typescript
// Describe the behavior, not the implementation
describe('findSkillsInCache', () => {
  it('should return empty array when cache directory does not exist', () => {})
  it('should find skills with valid SKILL.md file', () => {})
  it('should sort versions using semantic versioning', () => {})
})
```

## Testing Best Practices

### Test-First Approach
1. Write test that fails (red)
2. Implement minimum code to pass test (green)
3. Refactor to clean up implementation (refactor)

### Test Coverage Requirements
- **Minimum 80% coverage** for all new code
- **All edge cases tested**: null, empty, error states
- **Integration tests** for multi-component flows

### Testing Patterns
- **Unit tests**: Pure functions, no side effects
- **Integration tests**: Multiple components working together
- **Mocking**: Use vitest for filesystem, OpenCode client, async operations

### Code Coverage Measurement
```bash
npm run test:coverage
# Check report for untested branches/lines
```
