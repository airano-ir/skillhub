# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in SkillHub, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** Send details to [dev@airano.ir](mailto:dev@airano.ir)
2. **Subject:** `[SECURITY] Brief description`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix timeline:** Depends on severity (critical: 24-72h, high: 1-2 weeks)

### Scope

The following are in scope:
- SkillHub web application
- SkillHub CLI (`skillhub` npm package)
- SkillHub API endpoints
- Indexer/crawler service

The following are out of scope:
- Third-party services (GitHub, Meilisearch, Redis)
- Issues in dependencies (report to upstream)
- Social engineering attacks

## Security Measures

SkillHub implements the following security measures:

- **CSRF Protection:** All state-changing operations
- **Input Sanitization:** Query parameters and user inputs
- **Rate Limiting:** Per-endpoint rate limits
- **Security Headers:** CSP, HSTS, X-Frame-Options
- **Authentication:** GitHub OAuth via NextAuth.js
- **Skill Scanning:** Automated security analysis (PASS/WARNING/FAIL) for all indexed skills
- **SQL Injection Prevention:** Parameterized queries via Drizzle ORM

## Responsible Disclosure

We follow responsible disclosure practices. We ask that you:

- Allow reasonable time for a fix before public disclosure
- Do not access or modify other users' data
- Do not perform denial-of-service attacks
- Act in good faith

We will credit reporters in our changelog (unless you prefer to remain anonymous).
