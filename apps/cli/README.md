# @skillhub/cli

Command-line tool for installing and managing AI Agent skills from [SkillHub](https://skills.palebluedot.live).

## Installation

```bash
# Install globally
npm install -g @skillhub/cli

# Or use directly with npx
npx @skillhub/cli
```

## Usage

### Search for skills

```bash
skillhub search pdf
skillhub search "code review" --platform claude --limit 20
```

### Install a skill

```bash
skillhub install anthropics/skills/pdf
skillhub install obra/superpowers/brainstorming --platform codex
skillhub install anthropics/skills/docx --project  # Install in current project
```

### List installed skills

```bash
skillhub list
skillhub list --platform claude
```

### Update skills

```bash
skillhub update anthropics/skills/pdf     # Update specific skill
skillhub update --all                      # Update all installed skills
```

### Uninstall a skill

```bash
skillhub uninstall pdf
skillhub uninstall brainstorming --platform codex
```

### Configuration

```bash
skillhub config --list                      # Show all config
skillhub config --get defaultPlatform       # Get specific value
skillhub config --set defaultPlatform=claude  # Set value
```

## Platform Support

SkillHub CLI supports multiple AI agent platforms:

| Platform | Flag | Install Path |
|----------|------|--------------|
| Claude | `--platform claude` | `~/.claude/skills/` |
| OpenAI Codex | `--platform codex` | `~/.codex/skills/` |
| GitHub Copilot | `--platform copilot` | `~/.github/skills/` |
| Cursor | `--platform cursor` | `~/.cursor/skills/` |
| Windsurf | `--platform windsurf` | `~/.windsurf/skills/` |

Default platform: `claude`

## Options

### Global Options

- `--platform <name>` - Target platform (claude, codex, copilot, cursor, windsurf)
- `--project` - Install in current project instead of user directory
- `--force` - Overwrite existing installation
- `--help` - Show help information
- `--version` - Show version number

### Environment Variables

- `SKILLHUB_API_URL` - Override API endpoint (default: https://skills.palebluedot.live/api)
- `GITHUB_TOKEN` - GitHub token for API rate limits (optional)

## Configuration File

Configuration is stored in `~/.skillhub/config.json`:

```json
{
  "defaultPlatform": "claude",
  "apiUrl": "https://skills.palebluedot.live/api",
  "githubToken": "ghp_..."
}
```

## Examples

```bash
# Search and install a skill
skillhub search "document processing"
skillhub install anthropics/skills/pdf

# Install skill for Codex
skillhub install obra/superpowers/brainstorming --platform codex

# Update all installed skills
skillhub update --all

# Check what's installed
skillhub list
```

## License

MIT
