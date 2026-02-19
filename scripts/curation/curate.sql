-- ============================================================
-- Phase 2: Data Cleanup & Classification (Pure SQL version)
-- Run inside DB container:
--   psql -U postgres -d skillhub -f /tmp/curate.sql
--
-- Safe to run multiple times (idempotent).
-- ============================================================

\echo '======================================================================'
\echo '  STEP 1: COMPUTE repo_skill_count'
\echo '======================================================================'

UPDATE skills s SET repo_skill_count = sub.cnt
FROM (
  SELECT github_owner, github_repo, COUNT(*)::int AS cnt
  FROM skills WHERE is_blocked = false
  GROUP BY github_owner, github_repo
) sub
WHERE s.github_owner = sub.github_owner
  AND s.github_repo = sub.github_repo
  AND s.is_blocked = false;

\echo '  Step 1 done. Checking counts:'
SELECT 'repo_skill_count set' AS step,
       COUNT(*) FILTER (WHERE repo_skill_count IS NOT NULL) AS done,
       COUNT(*) FILTER (WHERE repo_skill_count IS NULL) AS remaining
FROM skills WHERE is_blocked = false;


\echo ''
\echo '======================================================================'
\echo '  STEP 2: MARK AGGREGATORS (repos with 50+ skills)'
\echo '======================================================================'

UPDATE skills s SET skill_type = 'aggregator'
FROM (
  SELECT github_owner, github_repo
  FROM skills WHERE is_blocked = false
  GROUP BY github_owner, github_repo
  HAVING COUNT(*) >= 50
) agg
WHERE s.github_owner = agg.github_owner
  AND s.github_repo = agg.github_repo
  AND s.is_blocked = false
  AND s.skill_type IS NULL;

\echo '  Step 2 done.'


\echo ''
\echo '======================================================================'
\echo '  STEP 3: CLASSIFY REMAINING REPOS'
\echo '======================================================================'

-- 3a: 10-49 skills + name contains marketplace/awesome/collection/registry → aggregator
UPDATE skills s SET skill_type = 'aggregator'
FROM (
  SELECT github_owner, github_repo
  FROM skills WHERE is_blocked = false AND skill_type IS NULL
  GROUP BY github_owner, github_repo
  HAVING COUNT(*) >= 10
     AND (github_repo ILIKE '%marketplace%'
       OR github_repo ILIKE '%awesome%'
       OR github_repo ILIKE '%collection%'
       OR github_repo ILIKE '%registry%')
) agg
WHERE s.github_owner = agg.github_owner
  AND s.github_repo = agg.github_repo
  AND s.is_blocked = false
  AND s.skill_type IS NULL;

-- 3b: 3+ skills → collection
UPDATE skills s SET skill_type = 'collection'
FROM (
  SELECT github_owner, github_repo
  FROM skills WHERE is_blocked = false AND skill_type IS NULL
  GROUP BY github_owner, github_repo
  HAVING COUNT(*) >= 3
) col
WHERE s.github_owner = col.github_owner
  AND s.github_repo = col.github_repo
  AND s.is_blocked = false
  AND s.skill_type IS NULL;

-- 3c: project-bound name patterns
UPDATE skills SET skill_type = 'project-bound'
WHERE is_blocked = false AND skill_type IS NULL
  AND repo_skill_count <= 2
  AND (name ILIKE '%my-%' OR name ILIKE '%my\_%' ESCAPE '\'
    OR name ILIKE '%project%' OR name ILIKE '%team%' OR name ILIKE '%internal%'
    OR name ILIKE '%.mdc' OR name ILIKE '%cursorrule%'
    OR name ILIKE '%config%' OR name ILIKE '%setup%');

-- 3d: remaining → standalone
UPDATE skills SET skill_type = 'standalone'
WHERE is_blocked = false AND skill_type IS NULL;

\echo '  Step 3 done. Classification:'
SELECT skill_type, COUNT(*)::int AS count
FROM skills WHERE is_blocked = false
GROUP BY skill_type ORDER BY count DESC;


\echo ''
\echo '======================================================================'
\echo '  STEP 4: FILL content_hash WITH md5 (for consistency)'
\echo '======================================================================'

-- Re-hash ALL with md5 for consistent dedup
UPDATE skills SET content_hash = md5(raw_content)
WHERE is_blocked = false AND raw_content IS NOT NULL;

\echo '  Step 4 done.'
SELECT 'content_hash' AS step,
       COUNT(*) FILTER (WHERE content_hash IS NOT NULL) AS has_hash,
       COUNT(*) FILTER (WHERE content_hash IS NULL) AS no_hash
FROM skills WHERE is_blocked = false;


\echo ''
\echo '======================================================================'
\echo '  STEP 5: MARK DUPLICATES BY content_hash'
\echo '======================================================================'

-- First reset any previous duplicate marks (for idempotency)
UPDATE skills SET is_duplicate = false, canonical_skill_id = NULL
WHERE is_blocked = false AND is_duplicate = true;

-- Mark duplicates: keep the one with most stars (or oldest) as canonical
WITH ranked AS (
  SELECT id, content_hash,
         ROW_NUMBER() OVER (
           PARTITION BY content_hash
           ORDER BY github_stars DESC NULLS LAST,
                    created_at ASC
         ) AS rn
  FROM skills
  WHERE is_blocked = false AND content_hash IS NOT NULL
),
canonicals AS (
  SELECT content_hash, id AS canonical_id
  FROM ranked WHERE rn = 1
)
UPDATE skills s
SET is_duplicate = true,
    canonical_skill_id = c.canonical_id
FROM ranked r
JOIN canonicals c ON r.content_hash = c.content_hash
WHERE s.id = r.id
  AND r.rn > 1;

\echo '  Step 5 done.'
SELECT 'dedup' AS step,
       COUNT(*) FILTER (WHERE is_duplicate = false) AS unique_skills,
       COUNT(*) FILTER (WHERE is_duplicate = true) AS duplicates
FROM skills WHERE is_blocked = false;


\echo ''
\echo '======================================================================'
\echo '  STEP 6: DETECT FORK MARKETPLACE REPOS'
\echo '======================================================================'

-- Re-classify fork repos (same repo name in 3+ owners with 20+ skills) as aggregator
UPDATE skills SET skill_type = 'aggregator'
WHERE is_blocked = false
  AND repo_skill_count >= 20
  AND (skill_type IS NULL OR skill_type != 'aggregator')
  AND github_repo IN (
    SELECT github_repo
    FROM skills
    WHERE is_blocked = false AND repo_skill_count >= 20
    GROUP BY github_repo
    HAVING COUNT(DISTINCT github_owner) >= 3
  );

\echo '  Step 6 done. Fork patterns:'
SELECT github_repo, COUNT(DISTINCT github_owner)::int AS owners,
       COUNT(*)::int AS total_skills
FROM skills
WHERE is_blocked = false AND repo_skill_count >= 20
GROUP BY github_repo
HAVING COUNT(DISTINCT github_owner) >= 3
ORDER BY owners DESC
LIMIT 15;


\echo ''
\echo '======================================================================'
\echo '  STEP 7: FINAL SUMMARY'
\echo '======================================================================'

SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE is_duplicate = false)::int AS unique_skills,
  COUNT(*) FILTER (WHERE is_duplicate = true)::int AS duplicates,
  COUNT(*) FILTER (WHERE skill_type = 'standalone' AND is_duplicate = false)::int AS standalone,
  COUNT(*) FILTER (WHERE skill_type = 'collection' AND is_duplicate = false)::int AS collection_type,
  COUNT(*) FILTER (WHERE skill_type = 'aggregator' AND is_duplicate = false)::int AS aggregator,
  COUNT(*) FILTER (WHERE skill_type = 'project-bound' AND is_duplicate = false)::int AS project_bound,
  COUNT(*) FILTER (WHERE skill_type IN ('standalone','collection') AND is_duplicate = false)::int AS browse_ready
FROM skills WHERE is_blocked = false;

\echo ''
\echo '  Top 20 standalone skills by stars:'
SELECT id, github_stars AS stars, COALESCE(download_count,0) AS dl,
       LEFT(description, 70) AS description
FROM skills
WHERE is_blocked = false AND is_duplicate = false AND skill_type = 'standalone'
ORDER BY github_stars DESC NULLS LAST
LIMIT 20;

\echo ''
\echo '  DONE!'
