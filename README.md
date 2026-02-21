# SkillHub

<div align="center">

![SkillHub](https://img.shields.io/badge/SkillHub-AI%20Agent%20Skills-blue?style=for-the-badge)

**The open-source marketplace for AI Agent skills**

[Documentation](./docs) | [CLI](./apps/cli) | [Self-Host](./docs/self-hosting.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Skills](https://img.shields.io/badge/Skills-170K%2B-green)](https://skills.palebluedot.live/api/stats)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

---

## What is SkillHub?

SkillHub indexes **hundreds of thousands of AI agent skills** from GitHub and makes them discoverable and installable. Skills are SKILL.md files that teach AI agents (Claude, Codex, Copilot) specialized capabilities - from PDF manipulation to database queries.

```bash
# Install a skill in seconds
npx skillhub install anthropics/skills/pdf
```

---

## Features

- **Massive Skill Catalog** - Search by category, platform, or keyword
- **One-Line Install** - `npx skillhub install <skill-id>`
- **Multi-Platform** - Works with Claude, OpenAI Codex, GitHub Copilot
- **Security Scanning** - Every skill scanned for malicious patterns
- **Self-Hostable** - Run your own instance with Docker
- **Fully Open Source** - MIT licensed, free forever

---

## Quick Start

### Install the CLI

```bash
npm install -g skillhub
```

### Search for Skills

```bash
skillhub search "pdf processing"
skillhub search "database" --category data-database
```

### Install a Skill

```bash
# For Claude Code (global)
skillhub install anthropics/skills/pdf

# For a specific project
skillhub install anthropics/skills/pdf --project

# For OpenAI Codex
skillhub install anthropics/skills/pdf --platform codex
```

### List Installed Skills

```bash
skillhub list
skillhub list --all  # Show both global and project skills
```

---

## Self-Hosting

```bash
# Clone the repository
git clone https://github.com/airano-ir/skillhub.git
cd skillhub

# Copy environment file
cp .env.example .env

# Start with Docker Compose
docker compose up -d

# Open http://localhost:3000
```

For production deployment, see [Self-Hosting Guide](./docs/self-hosting.md).

---

## Project Structure

```
skillhub/
├── apps/
│   ├── web/          # Next.js 15 web application
│   └── cli/          # CLI tool (npm: skillhub)
├── packages/
│   ├── core/         # SKILL.md parser & validator
│   ├── db/           # PostgreSQL + Drizzle ORM
│   └── ui/           # Shared shadcn/ui components
├── services/
│   └── indexer/      # GitHub skill crawler
└── docs/             # Documentation
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 18, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, PostgreSQL |
| Search | Meilisearch |
| CLI | Commander.js |
| DevOps | Docker, GitHub Actions |

---

## API

SkillHub provides a public REST API:

```bash
# Get skill info
curl https://skills.palebluedot.live/api/skills/anthropics/skills/pdf

# Search skills
curl "https://skills.palebluedot.live/api/skills?q=pdf&limit=10"

# Get stats
curl https://skills.palebluedot.live/api/stats
```

See [API Documentation](./docs/API.md) for full reference.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

---

## Security

SkillHub scans all indexed skills for:

- Dangerous shell commands (rm -rf, curl | sh)
- Prompt injection patterns
- Data exfiltration attempts

**Security Status:**
- **PASS** - No issues detected
- **WARNING** - Potential issues flagged
- **FAIL** - Dangerous patterns detected

Always review skill source code before installing.

---

## License

MIT - See [LICENSE](./LICENSE) for details.

---

## Links

- **Live Site:** https://skills.palebluedot.live
- **GitHub:** https://github.com/airano-ir/skillhub
- **npm:** https://www.npmjs.com/package/skillhub

---

<div align="center">

**[Browse Skills](https://skills.palebluedot.live/browse)** | **[Star on GitHub](https://github.com/airano-ir/skillhub)**

*Built with love for the AI agent community*

</div>
