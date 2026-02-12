# SkillHub Manual Test Checklist

This checklist covers features NOT covered by automated E2E tests (43 Playwright tests).
Complete before production deployment.

## Already Automated - SKIP These

The following are covered by E2E tests in `apps/web/e2e/*.spec.ts`:

| Area | E2E Coverage |
|------|--------------|
| **Homepage** | Page load, stats, featured skills, navigation links |
| **Browse** | Skills list, search input, search filter, platform filter, skill cards, detail navigation |
| **Categories** | Page load, category list, names, skill counts, navigation |
| **Skill Detail** | Name, description, platforms, install command, GitHub link |
| **i18n** | EN default, language switcher, FA switch, RTL, Persian text, context preserve |
| **Mobile** | Mobile nav, menu toggle, single column, text size, touch targets |
| **API** | `/api/health`, `/api/stats`, `/api/categories`, `/api/skills/*`, `/api/skills/featured`, `/api/skills/recent` |

**To run E2E tests:** `pnpm --filter @skillhub/web test:e2e`

---

**Tester:** ________________
**Date:** ________________
**Environment:** [ ] Local Docker [ ] Staging [ ] Production

---

## Prerequisites

- [ ] All Docker containers running (`docker ps`)
- [ ] Database has data (`docker exec skillhub-db psql -U postgres -d skillhub -c "SELECT COUNT(*) FROM skills;"`)
- [ ] Health endpoint OK (`curl http://localhost:3000/api/health`)
- [ ] GitHub OAuth configured (for auth tests)

---

## 1. Authentication (GitHub OAuth)

### Sign In Flow
| Test | Expected | Pass |
|------|----------|------|
| Click "Sign In" in header | Redirects to GitHub OAuth | [ ] |
| Approve on GitHub | Returns to app, user dropdown visible | [ ] |
| User dropdown shows avatar + name | GitHub profile info displayed | [ ] |
| Refresh page while signed in | Session persists | [ ] |

### Sign Out Flow
| Test | Expected | Pass |
|------|----------|------|
| Click user dropdown → Sign Out | Logged out, "Sign In" button reappears | [ ] |
| Refresh after sign out | Still logged out | [ ] |

---

## 2. Favorites System (Auth Required)

### API Endpoints
| Test | Expected | Pass |
|------|----------|------|
| `GET /api/favorites` (unauthenticated) | 401 Unauthorized | [ ] |
| `GET /api/favorites` (authenticated) | Returns user's favorites array | [ ] |
| `POST /api/favorites` with `{skillId}` | 200, skill added | [ ] |
| `DELETE /api/favorites` with `{skillId}` | 200, skill removed | [ ] |
| `POST /api/favorites/check` with `{skillIds}` | Returns favorited status | [ ] |

### UI Tests
| Test | Expected | Pass |
|------|----------|------|
| Click heart on skill detail (unauthenticated) | Redirects to sign in | [ ] |
| Click heart on skill detail (authenticated) | Heart fills red, added to favorites | [ ] |
| Click filled heart | Heart unfills, removed from favorites | [ ] |
| Go to `/favorites` page | Shows all favorited skills | [ ] |
| Click heart on favorites page | Skill removed from list | [ ] |
| Empty favorites state | "No favorites" message + Browse button | [ ] |

---

## 3. Ratings System (Auth Required)

### API Endpoints
| Test | Expected | Pass |
|------|----------|------|
| `GET /api/ratings?skillId=...` | Returns ratings array + summary | [ ] |
| `POST /api/ratings` with `{skillId, rating: 5}` | 200, rating saved | [ ] |
| `POST /api/ratings` with invalid rating (0 or 6) | 400 error | [ ] |
| `GET /api/ratings/me?skillId=...` (authenticated) | Returns user's rating | [ ] |

### UI Tests
| Test | Expected | Pass |
|------|----------|------|
| Click stars (unauthenticated) | Redirects to sign in | [ ] |
| Click stars to rate (authenticated) | Stars fill, rating submitted | [ ] |
| Change rating | New rating saved, average updates | [ ] |
| Refresh page | Rating persists | [ ] |

---

## 4. Interactive UI Elements

### Browse Page Filters
| Test | Expected | Pass |
|------|----------|------|
| Sort dropdown (Stars/Downloads/Recent/Rating) | Results re-sorted, URL updates | [ ] |
| Verified checkbox | Only verified skills shown | [ ] |
| Combined filters (platform + sort + verified) | All filters applied together | [ ] |
| Load More button | Next page loads, more skills appear | [ ] |

### Skill Detail - Install Section
| Test | Expected | Pass |
|------|----------|------|
| Platform tabs (Claude/Codex/Copilot) | Command changes for each platform | [ ] |
| Copy button | Command copied to clipboard, checkmark appears | [ ] |
| Download ZIP button | Opens GitHub ZIP download in new tab | [ ] |
| Select Folder button (Chrome) | File picker opens, skill files created | [ ] |

---

## 5. Pages Not in E2E Tests

### Featured Page (`/featured`)
| Test | Expected | Pass |
|------|----------|------|
| Page loads | Shows top featured skills | [ ] |
| Skills sorted by popularity | Highest stars first | [ ] |
| Skill cards clickable | Navigate to detail page | [ ] |

### New Skills Page (`/new`)
| Test | Expected | Pass |
|------|----------|------|
| Page loads | Shows recently added skills | [ ] |
| Skills sorted by date | Most recent first | [ ] |
| Timestamps displayed | "X hours/days ago" format | [ ] |

### Favorites Page (`/favorites`)
| Test | Expected | Pass |
|------|----------|------|
| Unauthenticated access | Redirects to sign in | [ ] |
| Authenticated + no favorites | Empty state shown | [ ] |
| Authenticated + has favorites | Skills grid displayed | [ ] |

---

## 6. Error States

| Test | Expected | Pass |
|------|----------|------|
| Navigate to `/nonexistent-page` | 404 page displayed | [ ] |
| Navigate to `/skill/invalid/id` | Error or 404 shown | [ ] |
| API returns error | Graceful error message | [ ] |

---

## 7. Docker Health Checks

| Service | Command | Expected | Pass |
|---------|---------|----------|------|
| Web | `curl http://localhost:3000/api/health` | `status: ok` | [ ] |
| Database | `docker exec skillhub-db pg_isready` | Ready | [ ] |
| Redis | `docker exec skillhub-redis redis-cli ping` | PONG | [ ] |
| Meilisearch | `curl http://localhost:7700/health` | `available` | [ ] |
| Indexer | `docker logs skillhub-indexer --tail=5` | No errors | [ ] |

---

## 8. Real Data Verification

| Test | Expected | Pass |
|------|----------|------|
| Skills in database | `SELECT COUNT(*) FROM skills` > 0 | [ ] |
| Skills have real GitHub data | `github_stars`, `github_owner` populated | [ ] |
| Search returns results | Search for existing skill works | [ ] |
| Meilisearch synced | `curl localhost:7700/indexes/skills/stats` shows documents | [ ] |

---

## Notes

_Record any issues found:_

```
______________________________________________________________
______________________________________________________________
______________________________________________________________
```

---

## Sign-off

- [ ] All tests pass
- [ ] No blocking issues
- [ ] Ready for production

**Signature:** ________________ **Date:** ________________
