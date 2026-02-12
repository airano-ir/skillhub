# CLAUDE.md

## Project Overview

SkillHub is an open-source marketplace for **Agent Skills** — folders containing a `SKILL.md` file with instructions that AI agents can load dynamically.

**Live Site:** https://skills.palebluedot.live | **Status:** Production (`GET /api/stats`)

**Components:**
- **Web App** (`apps/web`): Next.js 15 marketplace
- **CLI** (`apps/cli`): Skill installer (`npm install -g skillhub`)
- **Indexer** (`services/indexer`): GitHub crawler
- **Packages** (`packages/*`): Core logic, DB, UI components

## Common Commands

```bash
pnpm install                              # Install dependencies
pnpm dev                                  # Start all apps
pnpm --filter @skillhub/web dev           # Start only web app
pnpm build                                # Build all packages
pnpm test                                 # Run all tests (248 total)
pnpm --filter @skillhub/web test:e2e      # E2E tests (requires running app)
pnpm db:push                              # Push schema changes
docker compose up -d                      # Start all services
```

## Architecture

```
skillhub/
├── apps/
│   ├── web/           # Next.js 15 + App Router + next-intl (i18n)
│   └── cli/           # Commander.js CLI, builds with tsup
├── packages/
│   ├── core/          # SKILL.md parser, validator, security scanner
│   ├── db/            # Drizzle ORM schema and queries
│   └── ui/            # Shared shadcn/ui components
├── services/
│   └── indexer/       # BullMQ worker for GitHub crawling
└── scripts/           # Database initialization scripts
```

## Database

**Schema files** (keep in sync):
- `scripts/init-db.sql` — SQL schema
- `packages/db/src/schema.ts` — Drizzle ORM schema
- `scripts/categories.sql` — Production categories
- `scripts/seed-data.sql` — Dev sample data

**Caching:** Skill files cached in `cached_files` JSONB column, invalidated when `commitSha` changes.

## Important Patterns

### Next.js 15 Async Params
`params` and `searchParams` are Promises:
```typescript
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
}
```

### i18n (next-intl)
Routes use `[locale]` segment. Use `setRequestLocale(locale)` for static rendering.

### Dynamic Rendering
Add `export const dynamic = 'force-dynamic'` to pages that fetch from database.

### Package Imports
- `skillhub-core` — Parser/validator
- `@skillhub/db` — Database
- `@skillhub/ui` — UI components

### API Route Pattern
Skill IDs = `owner/repo/skill-name`. Use catch-all: `/api/skills/[...id]/route.ts`

### CLI Skill ID Encoding
```typescript
const encodedPath = id.split('/').map(encodeURIComponent).join('/');
```

### Meilisearch IDs
Sanitized: `anthropics/skills/pdf` → `anthropics__skills__pdf`

## Environment Variables

`DATABASE_URL`, `REDIS_URL`, `GITHUB_TOKEN`, `MEILI_URL` (optional), `MEILI_MASTER_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_SECRET`

## Indexer

```bash
docker compose exec indexer node dist/crawl.js full         # Full crawl
docker compose exec indexer node dist/crawl.js incremental  # Last 24h
docker compose exec indexer node dist/crawl.js sync-meili   # Sync to Meilisearch
docker compose exec indexer node dist/crawl.js deep-scan    # Scan discovered repos
```

## Security

Status stored in `security_status` column: **PASS** (green) / **WARNING** (yellow) / **FAIL** (red). Indexer scans for dangerous commands, prompt injection, and data exfiltration.

## Critical Files

| Category | Files |
|----------|-------|
| Database | `packages/db/src/schema.ts`, `packages/db/src/queries.ts` |
| API Routes | `apps/web/app/api/skills/route.ts`, `apps/web/app/api/skill-files/route.ts` |
| Auth | `apps/web/lib/auth.ts`, `apps/web/components/AuthButton.tsx` |
| Caching | `apps/web/lib/cache.ts` (Redis with TTL) |
| Rate Limiting | `apps/web/lib/rate-limit.ts` |
| Indexer | `services/indexer/src/crawler.ts`, `services/indexer/src/strategies/` |
| CLI | `apps/cli/src/commands/install.ts`, `apps/cli/src/utils/api.ts` |
