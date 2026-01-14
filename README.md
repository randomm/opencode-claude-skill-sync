# claude-skill-sync

Automatically syncs OpenCode plugin skills to Claude Code so they're available in every session—no manual setup required.

## Installation

Add the plugin to your OpenCode configuration file (`opencode.json` or `opencode.work.json`):

```json
{
  "plugin": ["@opencode-ai/claude-skill-sync"]
}
```

OpenCode installs and initializes the plugin automatically on startup. Skills sync in the background—OpenCode launches immediately without waiting.

### Pin a Specific Version (Optional)

To lock a specific version:

```json
{
  "plugin": ["@opencode-ai/claude-skill-sync@1.0.0"]
}
```

## How It Works

### Fire-and-Forget Synchronization

The plugin runs asynchronously when OpenCode starts. It doesn't block startup—OpenCode launches while skills sync in the background.

### Three-Step Discovery

1. **Find Skills**: Searches two locations in priority order
   - `~/.claude/plugins/cache/` (highest priority, typically most recent)
   - `~/.claude/plugins/marketplaces/` (fallback)

2. **Select Latest**: For cached plugins, automatically chooses the newest version

3. **Create Links**: Creates symlinks in `~/.claude/skills/` so Claude Code loads them automatically

### Symlink Management

- Creates new symlinks when skills are discovered
- Updates stale symlinks if a newer version is available
- Cleans broken links that no longer point to valid skills
- Respects a 100-skill limit to prevent system overload

## Features

- ✅ **Set and forget**: Runs asynchronously in background
- ✅ **Version-aware**: Always uses latest skill versions
- ✅ **Smart cleanup**: Removes broken or outdated symlinks
- ✅ **Non-blocking**: OpenCode startup stays fast
- ✅ **Safe limits**: Caps skills at 100 to prevent system overload
- ✅ **Error resilient**: Continues syncing even if individual skills fail

## Development

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/anomalyco/opencode-claude-skill-sync.git
cd opencode-claude-skill-sync
npm install
```

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run test` | Run all tests |
| `npm run test:watch` | Watch mode for development |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | Check code style with ESLint |
| `npm run typecheck` | Type-check with TypeScript |
| `npm run format` | Auto-format code with Prettier |
| `npm run clean` | Remove build artifacts |

### Quality Gates

Before pushing changes, run all quality gates locally:

```bash
npm run lint       # Must pass ESLint
npm run typecheck  # Must have zero TypeScript errors
npm run test       # Must have 80%+ code coverage
```

The project includes 38 tests covering:
- Skill discovery from cache and marketplaces
- Version comparison and selection
- Symlink creation, updates, and cleanup
- Error handling for missing directories

### Contributing

Issues and pull requests welcome. Follow [conventional commits](https://www.conventionalcommits.org/) for clean history. See `AGENTS.md` for contribution guidelines.

## License

MIT
