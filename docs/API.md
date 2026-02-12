# API Reference

SkillHub provides a public REST API for searching, browsing, and installing AI agent skills.

**Base URL:** `https://skills.palebluedot.live/api` (or your self-hosted instance)

---

## Authentication

Most read endpoints are public. Write operations require GitHub OAuth authentication via NextAuth.js.

### Rate Limits

| Tier | Limit | Description |
|------|-------|-------------|
| Anonymous | 100/min | Unauthenticated requests |
| Authenticated | 200/min | Logged-in users |
| Search | 60/min | Search queries |

---

## Skills

### Search Skills

```
GET /api/skills?q={query}&limit={limit}&offset={offset}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | - | Search query |
| `limit` | number | 20 | Results per page |
| `offset` | number | 0 | Pagination offset |

**Example:**
```bash
curl "https://skills.palebluedot.live/api/skills?q=pdf&limit=10"
```

### Get Skill Details

```
GET /api/skills/{owner}/{repo}/{skill-name}
```

Skill IDs use the format `owner/repo/skill-name`.

**Example:**
```bash
curl https://skills.palebluedot.live/api/skills/anthropics/skills/pdf
```

### Featured Skills

```
GET /api/skills/featured
```

Returns a curated list of featured skills. Response is cached.

### Recent Skills

```
GET /api/skills/recent
```

Returns recently updated skills. Response is cached.

### Track Installation

```
POST /api/skills/install
```

| Field | Type | Description |
|-------|------|-------------|
| `skillId` | string | Skill ID (`owner/repo/skill-name`) |
| `platform` | string | Target platform |
| `method` | string | Installation method |

### Submit Skill Addition Request

```
POST /api/skills/add-request
```

Requires authentication.

| Field | Type | Description |
|-------|------|-------------|
| `gitHubUrl` | string | GitHub repository URL |
| `skillPath` | string | Path to SKILL.md in repo |
| `reason` | string | Reason for submission |

### Submit Skill Removal Request

```
POST /api/skills/removal-request
```

Requires authentication.

| Field | Type | Description |
|-------|------|-------------|
| `skillId` | string | Skill to remove |
| `reason` | string | Reason for removal |

### Verify Ownership

```
GET /api/skills/verify-ownership?owner={owner}&repo={repo}
```

Requires authentication. Checks if the authenticated user owns the specified GitHub repository.

---

## Skill Files

### Get Skill Files

```
GET /api/skill-files?skillId={skillId}
```

Fetches skill file contents from GitHub (with caching).

### Download as ZIP

```
GET /api/skill-files/zip?skillId={skillId}&platform={platform}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `skillId` | string | Skill ID |
| `platform` | string | `claude`, `codex`, `copilot`, `cursor`, or `windsurf` |

---

## Categories

### List Categories

```
GET /api/categories
```

Returns all skill categories with skill counts.

**Example:**
```bash
curl https://skills.palebluedot.live/api/categories
```

---

## Ratings

### Get Reviews

```
GET /api/ratings?skillId={skillId}&limit={limit}&offset={offset}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skillId` | string | required | Skill ID |
| `limit` | number | 10 | Results per page |
| `offset` | number | 0 | Pagination offset |

### Submit Rating

```
POST /api/ratings
```

Requires authentication.

| Field | Type | Description |
|-------|------|-------------|
| `skillId` | string | Skill ID |
| `rating` | number | Rating (1-5) |
| `review` | string | Review text |

### Get My Rating

```
GET /api/ratings/me?skillId={skillId}
```

Requires authentication. Returns the current user's rating for a skill.

---

## Favorites

### Get My Favorites

```
GET /api/favorites
```

Requires authentication. Returns the user's favorited skills.

### Check Favorites

```
POST /api/favorites/check
```

Requires authentication.

| Field | Type | Description |
|-------|------|-------------|
| `skillIds` | string[] | Array of skill IDs to check |

---

## Newsletter

### Subscribe

```
GET /api/newsletter/subscribe?email={email}&locale={locale}
```

One-click subscription from email links.

### Unsubscribe

```
POST /api/newsletter/unsubscribe
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | Email to unsubscribe |

---

## Platform

### Statistics

```
GET /api/stats
```

Returns platform-wide statistics (cached).

**Example:**
```bash
curl https://skills.palebluedot.live/api/stats
```

**Response:**
```json
{
  "totalSkills": 178056,
  "totalDownloads": 2053,
  "totalCategories": 30,
  "totalContributors": 9552
}
```

### Health Check

```
GET /api/health
```

Returns health status of all services (database, Redis, Meilisearch).

### Attribution

```
GET /api/attribution
```

Returns attribution data including license distribution and discovery sources.

---

## Error Responses

All endpoints return standard HTTP status codes:

| Status | Description |
|--------|-------------|
| `200` | Success |
| `400` | Bad request (missing/invalid parameters) |
| `401` | Authentication required |
| `403` | Forbidden |
| `404` | Not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

Error response format:
```json
{
  "error": "Description of the error"
}
```

---

## CLI Usage

The [SkillHub CLI](https://www.npmjs.com/package/skillhub) uses these APIs internally:

```bash
# Install CLI
npm install -g skillhub

# Search skills
npx skillhub search pdf

# Install a skill
npx skillhub install anthropics/skills/pdf

# List installed skills
npx skillhub list
```
