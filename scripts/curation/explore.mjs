#!/usr/bin/env node
/**
 * Phase 1: Database Exploration — Single-Query Version
 *
 * Runs ALL analytics in ONE SQL query to handle unstable connections.
 *
 * Usage:
 *   PGSSLMODE=disable DATABASE_URL=postgres://... node scripts/curation/explore.mjs
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

let pg;
const tryPaths = [
  '/tmp/package.json',
  process.env.APPDATA ? resolve(process.env.APPDATA, '..', 'Local', 'Temp', 'package.json') : null,
  resolve(projectRoot, 'package.json'),
].filter(Boolean);
for (const p of tryPaths) {
  try { pg = createRequire(p)('pg'); break; } catch {}
}
if (!pg) { console.error('pg not found. Run: cd /tmp && npm install pg'); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillhub';

process.on('uncaughtException', e => {
  if (e.code === 'ECONNRESET') return;
  console.error('Fatal:', e); process.exit(1);
});

// ─── Mega Query ──────────────────────────────────────────
// All analytics combined into one JSON result

const MEGA_SQL = `
WITH active AS (
  SELECT * FROM skills WHERE is_blocked = false
),

-- 1. Overall
overall AS (
  SELECT json_build_object(
    'total', (SELECT COUNT(*)::int FROM skills),
    'active', (SELECT COUNT(*)::int FROM active),
    'blocked', (SELECT COUNT(*) FILTER (WHERE is_blocked)::int FROM skills),
    'owners', (SELECT COUNT(DISTINCT github_owner)::int FROM active),
    'repos', (SELECT COUNT(DISTINCT github_owner||'/'||github_repo)::int FROM active),
    'skillmd', (SELECT COUNT(*) FILTER (WHERE source_format='skill.md')::int FROM active),
    'other_fmt', (SELECT COUNT(*) FILTER (WHERE source_format!='skill.md')::int FROM active),
    'downloads', (SELECT COALESCE(SUM(download_count),0)::bigint FROM active),
    'views', (SELECT COALESCE(SUM(view_count),0)::bigint FROM active),
    'rated', (SELECT COUNT(*) FILTER (WHERE rating_count>0)::int FROM active),
    'first', (SELECT MIN(created_at)::text FROM active),
    'last', (SELECT MAX(created_at)::text FROM active)
  ) AS data
),

-- 1b. Source formats
source_formats AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT COALESCE(source_format,'null') AS format, COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE is_blocked=false)::int AS active
    FROM skills GROUP BY source_format ORDER BY count DESC
  ) t
),

-- 2. Stars distribution
stars_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN github_stars IS NULL OR github_stars=0 THEN '0'
      WHEN github_stars BETWEEN 1 AND 5 THEN '1-5'
      WHEN github_stars BETWEEN 6 AND 10 THEN '6-10'
      WHEN github_stars BETWEEN 11 AND 50 THEN '11-50'
      WHEN github_stars BETWEEN 51 AND 100 THEN '51-100'
      WHEN github_stars BETWEEN 101 AND 500 THEN '101-500'
      WHEN github_stars BETWEEN 501 AND 1000 THEN '501-1K'
      WHEN github_stars BETWEEN 1001 AND 5000 THEN '1K-5K'
      WHEN github_stars BETWEEN 5001 AND 10000 THEN '5K-10K'
      WHEN github_stars BETWEEN 10001 AND 50000 THEN '10K-50K'
      ELSE '50K+'
    END AS stars, COUNT(*)::int AS skills,
    COUNT(DISTINCT github_owner)::int AS owners,
    COUNT(DISTINCT github_owner||'/'||github_repo)::int AS repos
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(github_stars,0))
  ) t
),

-- 3. Downloads
dl_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN COALESCE(download_count,0)=0 THEN '0'
      WHEN download_count BETWEEN 1 AND 5 THEN '1-5'
      WHEN download_count BETWEEN 6 AND 50 THEN '6-50'
      WHEN download_count BETWEEN 51 AND 500 THEN '51-500'
      ELSE '500+'
    END AS range, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(download_count,0))
  ) t
),

-- 3b. Views
vw_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN COALESCE(view_count,0)=0 THEN '0'
      WHEN view_count BETWEEN 1 AND 10 THEN '1-10'
      WHEN view_count BETWEEN 11 AND 100 THEN '11-100'
      WHEN view_count BETWEEN 101 AND 1000 THEN '101-1K'
      ELSE '1K+'
    END AS range, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(view_count,0))
  ) t
),

-- 3c. Top downloaded
top_dl AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, download_count AS dl, view_count AS views,
           github_stars AS stars, github_owner AS owner
    FROM active WHERE COALESCE(download_count,0)>0
    ORDER BY download_count DESC LIMIT 20
  ) t
),

-- 3d. Top viewed
top_vw AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, view_count AS views, download_count AS dl,
           github_stars AS stars, github_owner AS owner
    FROM active WHERE COALESCE(view_count,0)>0
    ORDER BY view_count DESC LIMIT 20
  ) t
),

-- 4. Security
security AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT COALESCE(security_status,'null') AS status, COUNT(*)::int AS count
    FROM active GROUP BY security_status ORDER BY count DESC
  ) t
),

-- 5. Content stats
content_stats AS (
  SELECT json_build_object(
    'has_content', COUNT(*) FILTER (WHERE raw_content IS NOT NULL)::int,
    'no_content', COUNT(*) FILTER (WHERE raw_content IS NULL)::int,
    'avg_len', ROUND(AVG(LENGTH(raw_content)) FILTER (WHERE raw_content IS NOT NULL))::int,
    'max_len', MAX(LENGTH(raw_content))::int,
    'median_len', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(raw_content))
      FILTER (WHERE raw_content IS NOT NULL)::int,
    'avg_desc', ROUND(AVG(LENGTH(description)))::int,
    'good_desc', COUNT(*) FILTER (WHERE LENGTH(description)>100)::int,
    'short_desc', COUNT(*) FILTER (WHERE LENGTH(description)<=20)::int,
    'has_ver', COUNT(*) FILTER (WHERE version IS NOT NULL)::int,
    'has_lic', COUNT(*) FILTER (WHERE license IS NOT NULL)::int,
    'has_auth', COUNT(*) FILTER (WHERE author IS NOT NULL)::int,
    'has_hp', COUNT(*) FILTER (WHERE homepage IS NOT NULL)::int
  ) AS data FROM active
),

-- 5b. Content length dist
content_len AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN raw_content IS NULL THEN 'null'
      WHEN LENGTH(raw_content)=0 THEN 'empty'
      WHEN LENGTH(raw_content)<200 THEN '<200'
      WHEN LENGTH(raw_content)<500 THEN '200-500'
      WHEN LENGTH(raw_content)<1000 THEN '500-1K'
      WHEN LENGTH(raw_content)<3000 THEN '1K-3K'
      WHEN LENGTH(raw_content)<5000 THEN '3K-5K'
      WHEN LENGTH(raw_content)<10000 THEN '5K-10K'
      WHEN LENGTH(raw_content)<50000 THEN '10K-50K'
      ELSE '50K+'
    END AS range, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(LENGTH(raw_content),-1))
  ) t
),

-- 6. Triggers
trigger_stats AS (
  SELECT json_build_object(
    'has_triggers', COUNT(*) FILTER (WHERE triggers IS NOT NULL)::int,
    'no_triggers', COUNT(*) FILTER (WHERE triggers IS NULL)::int,
    'file_pats', COUNT(*) FILTER (WHERE triggers->>'filePatterns' IS NOT NULL
      AND triggers->>'filePatterns'!='[]' AND triggers->>'filePatterns'!='null')::int,
    'keywords', COUNT(*) FILTER (WHERE triggers->>'keywords' IS NOT NULL
      AND triggers->>'keywords'!='[]' AND triggers->>'keywords'!='null')::int,
    'languages', COUNT(*) FILTER (WHERE triggers->>'languages' IS NOT NULL
      AND triggers->>'languages'!='[]' AND triggers->>'languages'!='null')::int,
    'has_compat', COUNT(*) FILTER (WHERE compatibility IS NOT NULL)::int,
    'platforms', COUNT(*) FILTER (WHERE compatibility->>'platforms' IS NOT NULL
      AND compatibility->>'platforms'!='[]' AND compatibility->>'platforms'!='null')::int
  ) AS data FROM active
),

-- 7. Freshness
freshness AS (
  SELECT json_build_object(
    'created', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT CASE
        WHEN created_at>NOW()-INTERVAL '7 days' THEN 'Last 7d'
        WHEN created_at>NOW()-INTERVAL '30 days' THEN 'Last 30d'
        WHEN created_at>NOW()-INTERVAL '90 days' THEN 'Last 90d'
        WHEN created_at>NOW()-INTERVAL '180 days' THEN 'Last 180d'
        ELSE 'Older'
      END AS range, COUNT(*)::int AS skills
      FROM active GROUP BY 1 ORDER BY MIN(NOW()-created_at)
    ) t),
    'updated', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT CASE
        WHEN updated_at>NOW()-INTERVAL '7 days' THEN 'Last 7d'
        WHEN updated_at>NOW()-INTERVAL '30 days' THEN 'Last 30d'
        WHEN updated_at>NOW()-INTERVAL '90 days' THEN 'Last 90d'
        WHEN updated_at>NOW()-INTERVAL '180 days' THEN 'Last 180d'
        ELSE 'Older'
      END AS range, COUNT(*)::int AS skills
      FROM active GROUP BY 1 ORDER BY MIN(NOW()-updated_at)
    ) t),
    'last_dl', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT CASE
        WHEN last_downloaded_at IS NULL THEN 'Never'
        WHEN last_downloaded_at>NOW()-INTERVAL '30 days' THEN 'Last 30d'
        WHEN last_downloaded_at>NOW()-INTERVAL '90 days' THEN 'Last 90d'
        ELSE 'Older'
      END AS range, COUNT(*)::int AS skills
      FROM active GROUP BY 1 ORDER BY MIN(COALESCE(last_downloaded_at,'1970-01-01'::timestamp))
    ) t)
  ) AS data
),

-- 8. Top owners
top_owners_count AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner AS owner, COUNT(*)::int AS skills,
           COUNT(DISTINCT github_repo)::int AS repos,
           MAX(github_stars)::int AS max_stars,
           COALESCE(SUM(download_count),0)::int AS dl
    FROM active GROUP BY github_owner ORDER BY skills DESC LIMIT 30
  ) t
),
top_owners_stars AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner AS owner, MAX(github_stars)::int AS max_stars,
           COUNT(*)::int AS skills, COUNT(DISTINCT github_repo)::int AS repos
    FROM active GROUP BY github_owner ORDER BY max_stars DESC LIMIT 20
  ) t
),
owner_concentration AS (
  SELECT json_build_object(
    'top1', SUM(cnt) FILTER (WHERE rn<=1)::int,
    'top5', SUM(cnt) FILTER (WHERE rn<=5)::int,
    'top10', SUM(cnt) FILTER (WHERE rn<=10)::int,
    'top20', SUM(cnt) FILTER (WHERE rn<=20)::int,
    'top50', SUM(cnt) FILTER (WHERE rn<=50)::int,
    'total', SUM(cnt)::int,
    'owners', COUNT(*)::int
  ) AS data FROM (
    SELECT github_owner, COUNT(*)::int AS cnt,
           ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
    FROM active GROUP BY github_owner
  ) x
),

-- 9. Multi-skill repos
aggregators AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner||'/'||github_repo AS repo, COUNT(*)::int AS skills,
           MAX(github_stars)::int AS stars
    FROM active GROUP BY github_owner, github_repo HAVING COUNT(*)>=20
    ORDER BY skills DESC LIMIT 30
  ) t
),
collections AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner||'/'||github_repo AS repo, COUNT(*)::int AS skills,
           MAX(github_stars)::int AS stars
    FROM active GROUP BY github_owner, github_repo HAVING COUNT(*) BETWEEN 3 AND 19
    ORDER BY skills DESC LIMIT 30
  ) t
),
skills_per_repo AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    WITH rc AS (SELECT COUNT(*)::int AS cnt FROM active GROUP BY github_owner, github_repo)
    SELECT CASE
      WHEN cnt=1 THEN '1' WHEN cnt=2 THEN '2'
      WHEN cnt BETWEEN 3 AND 5 THEN '3-5' WHEN cnt BETWEEN 6 AND 10 THEN '6-10'
      WHEN cnt BETWEEN 11 AND 20 THEN '11-20' WHEN cnt BETWEEN 21 AND 50 THEN '21-50'
      WHEN cnt BETWEEN 51 AND 100 THEN '51-100' ELSE '100+'
    END AS per_repo, COUNT(*)::int AS repos, SUM(cnt)::int AS total_skills
    FROM rc GROUP BY 1 ORDER BY MIN(cnt)
  ) t
),

-- 10. Categories
categories_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT c.name AS category, c.skill_count::int AS skills
    FROM categories c WHERE c.id NOT LIKE 'parent-%' ORDER BY c.skill_count DESC
  ) t
),
uncategorized AS (
  SELECT COUNT(*)::int AS data FROM active s
  WHERE NOT EXISTS (SELECT 1 FROM skill_categories sc WHERE sc.skill_id=s.id)
),

-- 11. Flags
flags AS (
  SELECT json_build_object(
    'verified', COUNT(*) FILTER (WHERE is_verified)::int,
    'featured', COUNT(*) FILTER (WHERE is_featured)::int,
    'user_rated', COUNT(*) FILTER (WHERE rating_count>0)::int,
    'avg_rating', ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL),2)::numeric,
    'max_ratings', MAX(rating_count)::int
  ) AS data FROM active
),

-- 12. Cross-table
cross_stats AS (
  SELECT json_build_object(
    'users', (SELECT COUNT(*)::int FROM users),
    'ratings', (SELECT COUNT(*)::int FROM ratings),
    'installs', (SELECT COUNT(*)::int FROM installations),
    'favorites', (SELECT COUNT(*)::int FROM favorites),
    'disc_repos', (SELECT COUNT(*)::int FROM discovered_repos),
    'disc_with_skills', (SELECT COUNT(*) FILTER (WHERE has_skill_md)::int FROM discovered_repos),
    'removals', (SELECT COUNT(*)::int FROM removal_requests),
    'adds', (SELECT COUNT(*)::int FROM add_requests),
    'subs', (SELECT COUNT(*) FILTER (WHERE unsubscribed_at IS NULL)::int FROM email_subscriptions)
  ) AS data
),
install_platform AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT platform, COUNT(*)::int AS count FROM installations GROUP BY platform ORDER BY count DESC
  ) t
),

-- 13. Usability signals
usability AS (
  SELECT json_build_object(
    'strong', COUNT(*) FILTER (WHERE LENGTH(description)>50 AND raw_content IS NOT NULL
      AND LENGTH(raw_content)>500 AND security_status='pass')::int,
    'file_triggers', COUNT(*) FILTER (WHERE triggers IS NOT NULL AND triggers!='{}'
      AND triggers->>'filePatterns' IS NOT NULL AND triggers->>'filePatterns'!='[]')::int,
    'downloaded', COUNT(*) FILTER (WHERE COALESCE(download_count,0)>0)::int,
    'high_q', COUNT(*) FILTER (WHERE github_stars>=10 AND LENGTH(description)>50
      AND raw_content IS NOT NULL AND security_status='pass')::int,
    'premium', COUNT(*) FILTER (WHERE github_stars>=100 AND COALESCE(download_count,0)>0
      AND security_status='pass')::int,
    'skillmd_q', COUNT(*) FILTER (WHERE source_format='skill.md' AND LENGTH(description)>50
      AND raw_content IS NOT NULL AND LENGTH(raw_content)>300 AND security_status='pass')::int
  ) AS data FROM active
),

-- 14. Standalone vs project-bound
repo_types AS (
  SELECT json_build_object(
    'single', COUNT(*) FILTER (WHERE cnt=1)::int,
    'two', COUNT(*) FILTER (WHERE cnt=2)::int,
    'multi', COUNT(*) FILTER (WHERE cnt>=3)::int,
    'total', COUNT(*)::int
  ) AS data FROM (
    SELECT COUNT(*)::int AS cnt FROM active GROUP BY github_owner, github_repo
  ) x
),
name_patterns AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN name ILIKE '%rule%' OR name ILIKE '%config%' OR name ILIKE '%setup%' THEN 'rules/config/setup'
      WHEN name ILIKE '%my-%' OR name ILIKE '%my_%' THEN 'my-prefix'
      WHEN name ILIKE '%cursor%' OR name ILIKE '%claude%' OR name ILIKE '%copilot%' THEN 'tool-specific'
      WHEN name ILIKE '%project%' OR name ILIKE '%team%' OR name ILIKE '%internal%' THEN 'project/team'
      WHEN name ILIKE '%.mdc' OR name ILIKE '%cursorrule%' THEN 'cursor-rules'
      ELSE 'generic'
    END AS pattern, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY skills DESC
  ) t
),

-- 15. Samples
top_by_stars AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, github_stars AS stars, COALESCE(download_count,0) AS dl,
           security_status AS sec, source_format AS fmt, LEFT(description,80) AS description
    FROM active ORDER BY github_stars DESC LIMIT 15
  ) t
),
top_by_dl AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, download_count AS dl, view_count AS views,
           github_stars AS stars, LEFT(description,80) AS description
    FROM active WHERE COALESCE(download_count,0)>0
    ORDER BY download_count DESC LIMIT 15
  ) t
),

-- 16. Discovered repos
discovered AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT discovered_via AS source, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE has_skill_md)::int AS with_skills,
           COUNT(*) FILTER (WHERE last_scanned IS NOT NULL)::int AS scanned
    FROM discovered_repos GROUP BY discovered_via ORDER BY total DESC
  ) t
),

-- 18. Cache
cache_stats AS (
  SELECT json_build_object(
    'cached', COUNT(*) FILTER (WHERE cached_files IS NOT NULL)::int,
    'not_cached', COUNT(*) FILTER (WHERE cached_files IS NULL)::int
  ) AS data FROM active
),

-- 19. Branches
branches AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT COALESCE(branch,'null') AS branch, COUNT(*)::int AS count
    FROM active GROUP BY branch ORDER BY count DESC LIMIT 10
  ) t
),

-- 20. Duplicates
exact_dupes AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT name, LEFT(description,60) AS desc, COUNT(*)::int AS copies,
           STRING_AGG(DISTINCT github_owner,', ') AS owners
    FROM active WHERE description IS NOT NULL AND LENGTH(description)>10
    GROUP BY name, description HAVING COUNT(*)>1
    ORDER BY copies DESC LIMIT 15
  ) t
),
hash_dupes AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT content_hash, COUNT(*)::int AS copies,
           MIN(name) AS sample, STRING_AGG(DISTINCT github_owner,', ') AS owners
    FROM active WHERE content_hash IS NOT NULL
    GROUP BY content_hash HAVING COUNT(*)>2
    ORDER BY copies DESC LIMIT 15
  ) t
)

-- Final: combine everything into one JSON
SELECT json_build_object(
  'overall', (SELECT data FROM overall),
  'sourceFormats', (SELECT data FROM source_formats),
  'starsDist', (SELECT data FROM stars_dist),
  'dlDist', (SELECT data FROM dl_dist),
  'vwDist', (SELECT data FROM vw_dist),
  'topDL', (SELECT data FROM top_dl),
  'topVW', (SELECT data FROM top_vw),
  'security', (SELECT data FROM security),
  'contentStats', (SELECT data FROM content_stats),
  'contentLen', (SELECT data FROM content_len),
  'triggerStats', (SELECT data FROM trigger_stats),
  'freshness', (SELECT data FROM freshness),
  'topOwnersCount', (SELECT data FROM top_owners_count),
  'topOwnersStars', (SELECT data FROM top_owners_stars),
  'ownerConcentration', (SELECT data FROM owner_concentration),
  'aggregators', (SELECT data FROM aggregators),
  'collections', (SELECT data FROM collections),
  'skillsPerRepo', (SELECT data FROM skills_per_repo),
  'categories', (SELECT data FROM categories_dist),
  'uncategorized', (SELECT data FROM uncategorized),
  'flags', (SELECT data FROM flags),
  'crossStats', (SELECT data FROM cross_stats),
  'installPlatform', (SELECT data FROM install_platform),
  'usability', (SELECT data FROM usability),
  'repoTypes', (SELECT data FROM repo_types),
  'namePatterns', (SELECT data FROM name_patterns),
  'topByStars', (SELECT data FROM top_by_stars),
  'topByDL', (SELECT data FROM top_by_dl),
  'discovered', (SELECT data FROM discovered),
  'cacheStats', (SELECT data FROM cache_stats),
  'branches', (SELECT data FROM branches),
  'exactDupes', (SELECT data FROM exact_dupes),
  'hashDupes', (SELECT data FROM hash_dupes)
) AS report;
`;

// ─── Helpers ─────────────────────────────────────────────

function header(title) {
  console.log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}`);
}
function sub(title) {
  console.log(`\n  -- ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}
function tbl(rows, max = 30) {
  if (!rows || rows.length === 0) { console.log('    (no data)'); return; }
  const display = rows.slice(0, max);
  const keys = Object.keys(display[0]);
  const w = keys.map(k => Math.max(k.length, ...display.map(r => String(r[k] ?? '').length)));
  console.log('    ' + keys.map((k, i) => k.padEnd(w[i])).join('  '));
  console.log('    ' + w.map(x => '-'.repeat(x)).join('  '));
  for (const row of display)
    console.log('    ' + keys.map((k, i) => String(row[k] ?? '').padEnd(w[i])).join('  '));
  if (rows.length > max) console.log(`    ... and ${rows.length - max} more`);
}
const n = v => Number(v ?? 0).toLocaleString('en-US');
const p = (a, b) => (Number(b ?? 1) === 0 ? '0.0%' : (Number(a ?? 0) / Number(b) * 100).toFixed(1) + '%');

// ─── Run ─────────────────────────────────────────────────

async function run() {
  const t0 = Date.now();
  console.log('Connecting and running mega-query (this may take 30-60s)...');

  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: false,
    connectionTimeoutMillis: 15000, query_timeout: 120000,
    keepAlive: true, keepAliveInitialDelayMillis: 1000 });
  await c.connect();
  const result = await c.query(MEGA_SQL);
  await c.end().catch(() => {});

  const r = result.rows[0].report;
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Query completed in ${dur}s\n`);

  // ── Display ──
  const total = r.overall.active;

  header('1. OVERALL STATISTICS');
  const ov = r.overall;
  console.log(`    Total skills:         ${n(ov.total)}`);
  console.log(`    Active (not blocked): ${n(ov.active)}`);
  console.log(`    Blocked:              ${n(ov.blocked)}`);
  console.log(`    Unique owners:        ${n(ov.owners)}`);
  console.log(`    Unique repos:         ${n(ov.repos)}`);
  console.log(`    SKILL.md format:      ${n(ov.skillmd)} (${p(ov.skillmd, ov.total)})`);
  console.log(`    Other formats:        ${n(ov.other_fmt)} (${p(ov.other_fmt, ov.total)})`);
  console.log(`    Total downloads:      ${n(ov.downloads)}`);
  console.log(`    Total views:          ${n(ov.views)}`);
  console.log(`    Rated skills:         ${n(ov.rated)}`);
  console.log(`    Date range:           ${ov.first} -> ${ov.last}`);
  sub('Source Formats');
  tbl(r.sourceFormats);

  header('2. GITHUB STARS');
  tbl(r.starsDist);

  header('3. ENGAGEMENT');
  sub('Downloads');  tbl(r.dlDist);
  sub('Views');      tbl(r.vwDist);
  sub('Top 20 Downloaded'); tbl(r.topDL);
  sub('Top 20 Viewed');     tbl(r.topVW);

  header('4. SECURITY');
  tbl(r.security);

  header('5. CONTENT');
  const cs = r.contentStats;
  console.log(`    Has content:    ${n(cs.has_content)} (${p(cs.has_content, total)})`);
  console.log(`    No content:     ${n(cs.no_content)} (${p(cs.no_content, total)})`);
  console.log(`    Avg length:     ${n(cs.avg_len)} | Median: ${n(cs.median_len)} | Max: ${n(cs.max_len)}`);
  console.log(`    Avg desc:       ${n(cs.avg_desc)} | Good(>100): ${n(cs.good_desc)} | Short(<=20): ${n(cs.short_desc)}`);
  console.log(`    Version: ${n(cs.has_ver)} | License: ${n(cs.has_lic)} | Author: ${n(cs.has_auth)} | HP: ${n(cs.has_hp)}`);
  sub('Content Length Dist');
  tbl(r.contentLen);

  header('6. TRIGGERS');
  const tr = r.triggerStats;
  console.log(`    Has triggers:   ${n(tr.has_triggers)} (${p(tr.has_triggers, total)})`);
  console.log(`    filePatterns: ${n(tr.file_pats)} | keywords: ${n(tr.keywords)} | languages: ${n(tr.languages)}`);
  console.log(`    Compatibility: ${n(tr.has_compat)} | platforms: ${n(tr.platforms)}`);

  header('7. FRESHNESS');
  sub('Created');  tbl(r.freshness.created);
  sub('Updated');  tbl(r.freshness.updated);
  sub('Last DL');  tbl(r.freshness.last_dl);

  header('8. TOP OWNERS');
  sub('By Skill Count'); tbl(r.topOwnersCount);
  sub('By Stars');       tbl(r.topOwnersStars);
  sub('Concentration');
  const oc = r.ownerConcentration;
  console.log(`    Top 1:  ${n(oc.top1)} (${p(oc.top1, oc.total)}) | Top 5: ${n(oc.top5)} (${p(oc.top5, oc.total)}) | Top 10: ${n(oc.top10)} (${p(oc.top10, oc.total)})`);
  console.log(`    Top 20: ${n(oc.top20)} (${p(oc.top20, oc.total)}) | Top 50: ${n(oc.top50)} (${p(oc.top50, oc.total)}) | Total owners: ${n(oc.owners)}`);

  header('9. MULTI-SKILL REPOS');
  sub('Aggregators (20+)'); tbl(r.aggregators);
  sub('Collections (3-19)'); tbl(r.collections);
  sub('Skills-per-Repo');    tbl(r.skillsPerRepo);

  header('10. CATEGORIES');
  tbl(r.categories);
  console.log(`\n    Uncategorized: ${n(r.uncategorized)}`);

  header('11. FLAGS');
  const fl = r.flags;
  console.log(`    Verified: ${n(fl.verified)} | Featured: ${n(fl.featured)} | Rated: ${n(fl.user_rated)} | Avg: ${fl.avg_rating ?? 'N/A'}`);

  header('12. CROSS-TABLE');
  const xt = r.crossStats;
  console.log(`    Users: ${n(xt.users)} | Ratings: ${n(xt.ratings)} | Installs: ${n(xt.installs)} | Favs: ${n(xt.favorites)}`);
  console.log(`    Discovered: ${n(xt.disc_repos)} (${n(xt.disc_with_skills)} with skills) | Subs: ${n(xt.subs)}`);
  sub('Install Platform'); tbl(r.installPlatform);

  header('13. USABILITY SIGNALS');
  const us = r.usability;
  console.log(`    Strong standalone:  ${n(us.strong)} (desc>50 + content>500 + sec=pass)`);
  console.log(`    File triggers:      ${n(us.file_triggers)}`);
  console.log(`    Ever downloaded:    ${n(us.downloaded)}`);
  console.log(`    High quality:       ${n(us.high_q)} (stars>=10 + desc + sec)`);
  console.log(`    Premium:            ${n(us.premium)} (stars>=100 + dl>0 + sec)`);
  console.log(`    SKILL.md quality:   ${n(us.skillmd_q)}`);

  header('14. STANDALONE vs PROJECT-BOUND');
  const sm = r.repoTypes;
  console.log(`    Single: ${n(sm.single)} (${p(sm.single,sm.total)}) | Two: ${n(sm.two)} | Multi: ${n(sm.multi)} | Total repos: ${n(sm.total)}`);
  sub('Name Patterns'); tbl(r.namePatterns);

  header('15. SAMPLES');
  sub('Top by Stars'); tbl(r.topByStars);
  sub('Top by DL');    tbl(r.topByDL);

  header('16. DISCOVERED REPOS');
  tbl(r.discovered);

  header('17. CACHE');
  const cf = r.cacheStats;
  console.log(`    Cached: ${n(cf.cached)} (${p(cf.cached,total)}) | Not: ${n(cf.not_cached)}`);

  header('19. BRANCHES');
  tbl(r.branches);

  header('20. DUPLICATES');
  sub('Same Name+Desc'); tbl(r.exactDupes);
  sub('Same Hash (3+)'); tbl(r.hashDupes);

  header(`COMPLETE (${dur}s)`);

  // Save JSON
  r.generatedAt = new Date().toISOString();
  r.durationSeconds = parseFloat(dur);
  const reportPath = resolve(__dirname, 'explore-report.json');
  writeFileSync(reportPath, JSON.stringify(r, null, 2), 'utf-8');
  console.log(`\n  Report saved: ${reportPath}`);
}

run().catch(async e => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
