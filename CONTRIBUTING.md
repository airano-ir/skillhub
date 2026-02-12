# Contributing to SkillHub

Thank you for your interest in contributing to SkillHub! This document provides guidelines and instructions for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Please be respectful and constructive in all interactions.

---

## How Can I Contribute?

### Report Bugs

Found a bug? Please open an issue with:

1. **Clear title** describing the problem
2. **Steps to reproduce** the issue
3. **Expected behavior** vs actual behavior
4. **Environment details** (OS, Node version, browser)
5. **Screenshots** if applicable

### Suggest Features

Have an idea? Open an issue with:

1. **Use case** - What problem does it solve?
2. **Proposed solution** - How should it work?
3. **Alternatives considered** - What else did you think about?

### Submit Skills

Want to add your skill to SkillHub?

1. Ensure your repository has a valid `SKILL.md` file
2. Go to [skills.palebluedot.live/claim](https://skills.palebluedot.live/claim)
3. Sign in with GitHub
4. Submit your repository URL

### Code Contributions

We welcome code contributions for:

- Bug fixes
- New features
- Performance improvements
- Documentation updates
- Test coverage
- Translations (i18n)

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+
- Docker (for database and services)
- Git

### Setup Steps

```bash
# Clone the repository
git clone https://github.com/airano-ir/skillhub.git
cd skillhub

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start infrastructure (database, redis, meilisearch)
docker compose up -d db redis meilisearch

# Run database migrations
pnpm db:push

# Seed sample data (optional)
docker exec -i skillhub-db psql -U postgres -d skillhub < scripts/seed-data.sql

# Start development servers
pnpm dev
```

### Project Scripts

```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript type checking
```

### Package-Specific Commands

```bash
# Web app
pnpm --filter @skillhub/web dev
pnpm --filter @skillhub/web build

# CLI
pnpm --filter skillhub dev
pnpm --filter skillhub build

# Core library
pnpm --filter skillhub-core test

# Database
pnpm --filter @skillhub/db studio  # Open Drizzle Studio
```

---

## Pull Request Process

### Before Submitting

1. **Create an issue first** - Discuss your change before implementing
2. **Fork the repository** - Work on your own fork
3. **Create a feature branch** - `git checkout -b feature/your-feature`
4. **Write tests** - Add tests for new functionality
5. **Run tests locally** - `pnpm test`
6. **Lint your code** - `pnpm lint`

### PR Guidelines

1. **Title format:** `type(scope): description`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   - Example: `feat(cli): add update --all command`

2. **Description should include:**
   - What changes were made
   - Why the changes were needed
   - How to test the changes
   - Screenshots (for UI changes)

3. **Keep PRs focused** - One feature/fix per PR

4. **Update documentation** - If your change affects user-facing features

### Review Process

1. Maintainers will review within 3-5 business days
2. Address feedback promptly
3. Once approved, a maintainer will merge

---

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` type - use `unknown` or proper types
- Use interfaces over types when possible

```typescript
// Good
interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
}

// Avoid
const skill: any = fetchSkill();
```

### React/Next.js

- Use functional components with hooks
- Prefer server components where possible
- Use `next-intl` for translations
- Follow Next.js 15 patterns (async params, etc.)

```typescript
// Good - Next.js 15 pattern
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

### Styling

- Use Tailwind CSS
- Follow design token system (`bg-surface`, `text-text-primary`)
- Avoid hardcoded colors
- Support dark mode

```tsx
// Good
<div className="bg-surface text-text-primary">

// Avoid
<div className="bg-white text-gray-900">
```

### Testing

- Write unit tests for utilities and functions
- Write integration tests for API routes
- Use Vitest for unit tests
- Use Playwright for E2E tests

```typescript
// Example test
import { describe, it, expect } from 'vitest';

describe('parseSkillMd', () => {
  it('should parse valid SKILL.md', () => {
    const result = parseSkillMd(validInput);
    expect(result.name).toBe('expected-name');
  });
});
```

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no code change) |
| `refactor` | Code restructuring |
| `test` | Adding tests |
| `chore` | Maintenance |

### Examples

```bash
feat(cli): add search command with category filter
fix(web): resolve RTL layout issues on skill page
docs: update README with new installation steps
test(core): add tests for SKILL.md parser
```

---

## Questions?

- **GitHub Discussions:** For general questions
- **GitHub Issues:** For bugs and feature requests
- **Discord:** Coming soon

---

Thank you for contributing to SkillHub!
