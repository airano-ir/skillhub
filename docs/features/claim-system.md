# Claim System

## Overview

The claim system allows users to:
1. **Add Skills**: Request to add their GitHub repositories containing SKILL.md files
2. **Remove Skills**: Request to remove their skills from SkillHub (auto-approved for verified owners)

## Add Skill Flow

### User Actions
1. Sign in with GitHub OAuth
2. Navigate to `/claim#add`
3. Enter GitHub repository URL
4. Optionally provide reason for adding the skill
5. Submit request

### Backend Processing
1. Validate GitHub URL format
2. Check if repository exists and is public
3. Scan repository for SKILL.md files (recursive auto-scan)
4. Create pending add request in database
5. Send confirmation email ONLY if skills found (`skillCount > 0`)

### Email Behavior
- **Skills found**: Email sent with count
- **No skills found**: No email sent (manual review needed, user notified on screen)

### Success States
- **1 skill found**: "SKILL.md was found and will be indexed soon"
- **Multiple skills**: "Found N skills that will be indexed soon"
- **No skills**: "No SKILL.md found - repository will be reviewed manually. You will receive an email if skills are approved for indexing."

### Field Requirements
- **Repository URL**: Required
- **Reason**: Optional (defaults to "No reason provided")

## Remove Skill Flow

### User Actions
1. Sign in with GitHub OAuth
2. Navigate to `/claim#remove`
3. Enter skill ID (format: `owner/repo/skill-name`)
4. Optionally provide reason for removal
5. Submit request

### Backend Processing
1. Verify skill exists in database
2. Verify user owns the repository (via GitHub API)
3. Auto-approve and block skill from indexing
4. Send confirmation email

### Field Requirements
- **Skill ID**: Required
- **Reason**: Optional (defaults to "No reason provided")

## Error Handling

| Error Code | Message | Trigger |
|------------|---------|---------|
| `INVALID_URL` | Invalid GitHub URL | Malformed URL |
| `INVALID_REPO` | Repository not found or not accessible | 404 from GitHub or private repo |
| `RATE_LIMIT_EXCEEDED` | GitHub API rate limit exceeded | 403 with rate limit header |
| `NETWORK_TIMEOUT` | Request timed out | Timeout during validation |
| `ALREADY_PENDING` | Pending request exists | Duplicate request |
| `NOT_OWNER` | Not repository owner | Ownership verification failed (remove only) |
| `SKILL_NOT_FOUND` | Skill not in database | Skill ID doesn't exist (remove only) |
| `GITHUB_ERROR` | GitHub verification failed | General GitHub API error |
| `INVALID_SKILL` | Invalid GitHub info | Skill missing repo data |

## Implementation Notes

### Key Features
- **Auto-scan**: Entire repository is scanned recursively for all SKILL.md files
- **No manual path input**: Removed confusing "Skill Path" field
- **Optional reasons**: Users don't have to explain their requests
- **Conditional emails**: Only send when skills are actually found
- **Bilingual**: Full support for English and Farsi (RTL)
- **Specific errors**: Each edge case has a clear, actionable error message

### Technical Details
- **API Routes**: `/api/skills/add-request` and `/api/skills/removal-request`
- **Component**: `ClaimForm.tsx` with tab-based UI
- **i18n**: Uses next-intl for translations
- **Email**: Resend library with bilingual templates
- **Security**: CSRF protection, GitHub OAuth verification

### Recent Improvements (Feb 2026)
- ✅ Fixed email logic to only send when skills found
- ✅ Made reason fields optional
- ✅ Removed confusing skill path field
- ✅ Improved success messages for different states
- ✅ Added specific error messages for rate limits, timeouts, and private repos
