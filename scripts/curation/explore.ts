#!/usr/bin/env tsx
/**
 * Phase 1: Database Exploration for Curation
 *
 * Comprehensive analysis of all indexed skills to understand:
 * - Overall statistics and distribution
 * - Quality signals and content analysis
 * - Owner/repo concentration
 * - Freshness and activity
 * - Usability signals for curation decisions
 *
 * Usage:
 *   cd services/indexer && npx tsx ../../scripts/curation/explore.ts
 *
 * Output: prints report to console + saves JSON to scripts/curation/explore-report.json
 */

import { createDb, closeDb, sql } from '@skillhub/db';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Connection ────────────────────────────────────────────────────────────────

const db = createDb();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function header(title: string) {
  const line = '='.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function subHeader(title: string) {
  console.log(`\n  -- ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

function table(rows: Record<string, unknown>[], maxRows = 30) {
  if (rows.length === 0) {
    console.log('    (no data)');
    return;
  }
  const display = rows.slice(0, maxRows);
  const keys = Object.keys(display[0]);
  const widths = keys.map(k =>
    Math.max(k.length, ...display.map(r => String(r[k] ?? '').length))
  );

  // Header
  console.log('    ' + keys.map((k, i) => k.padEnd(widths[i])).join('  '));
  console.log('    ' + widths.map(w => '-'.repeat(w)).join('  '));

  // Rows
  for (const row of display) {
    console.log('    ' + keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  '));
  }
  if (rows.length > maxRows) {
    console.log(`    ... and ${rows.length - maxRows} more rows`);
  }
}

function num(n: unknown): string {
  return Number(n ?? 0).toLocaleString('en-US');
}

function pct(part: unknown, total: unknown): string {
  const p = Number(part ?? 0);
  const t = Number(total ?? 1);
  if (t === 0) return '0.0%';
  return (p / t * 100).toFixed(1) + '%';
}

// Helper: execute raw SQL and return rows
async function query<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  const result = await db.execute(sql.raw(String.raw(strings, ...values)));
  return result.rows as T[];
}

// ─── Report accumulator ────────────────────────────────────────────────────────

const report: Record<string, unknown> = {};

// ─── Queries ───────────────────────────────────────────────────────────────────

async function runExploration() {
  const startTime = Date.now();

  // ======================================================================
  // 1. OVERALL STATISTICS
  // ======================================================================
  header('1. OVERALL STATISTICS');

  const overallRows = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                   AS total_skills,
      COUNT(*) FILTER (WHERE is_blocked = false)::int                 AS active_skills,
      COUNT(*) FILTER (WHERE is_blocked = true)::int                  AS blocked_skills,
      COUNT(DISTINCT github_owner)::int                               AS unique_owners,
      COUNT(DISTINCT github_owner || '/' || github_repo)::int         AS unique_repos,
      COUNT(*) FILTER (WHERE source_format = 'skill.md')::int         AS skill_md_count,
      COUNT(*) FILTER (WHERE source_format != 'skill.md')::int        AS other_format_count,
      COALESCE(SUM(download_count), 0)::bigint                        AS total_downloads,
      COALESCE(SUM(view_count), 0)::bigint                            AS total_views,
      COUNT(*) FILTER (WHERE rating_count > 0)::int                   AS rated_skills,
      COALESCE(SUM(rating_count), 0)::int                             AS total_ratings,
      MIN(created_at)::text                                           AS earliest_skill,
      MAX(created_at)::text                                           AS latest_skill
    FROM skills
  `);
  const overall = overallRows.rows[0] as Record<string, unknown>;
  report.overall = overall;

  console.log(`    Total skills:       ${num(overall.total_skills)}`);
  console.log(`    Active (not blocked): ${num(overall.active_skills)}`);
  console.log(`    Blocked:            ${num(overall.blocked_skills)}`);
  console.log(`    Unique owners:      ${num(overall.unique_owners)}`);
  console.log(`    Unique repos:       ${num(overall.unique_repos)}`);
  console.log(`    SKILL.md format:    ${num(overall.skill_md_count)} (${pct(overall.skill_md_count, overall.total_skills)})`);
  console.log(`    Other formats:      ${num(overall.other_format_count)} (${pct(overall.other_format_count, overall.total_skills)})`);
  console.log(`    Total downloads:    ${num(overall.total_downloads)}`);
  console.log(`    Total views:        ${num(overall.total_views)}`);
  console.log(`    Rated skills:       ${num(overall.rated_skills)}`);
  console.log(`    Total ratings:      ${num(overall.total_ratings)}`);
  console.log(`    Date range:         ${overall.earliest_skill} -> ${overall.latest_skill}`);

  const total = Number(overall.active_skills);

  // Source format distribution
  subHeader('Source Format Distribution');
  const sfRows = await db.execute(sql`
    SELECT
      COALESCE(source_format, 'null') AS format,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE is_blocked = false)::int AS active
    FROM skills
    GROUP BY source_format
    ORDER BY count DESC
  `);
  report.sourceFormats = sfRows.rows;
  table(sfRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 2. STARS DISTRIBUTION
  // ======================================================================
  header('2. GITHUB STARS DISTRIBUTION');

  const starsRows = await db.execute(sql`
    SELECT
      CASE
        WHEN github_stars IS NULL OR github_stars = 0 THEN '0 stars'
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
      END AS star_range,
      COUNT(*)::int AS skills,
      COUNT(DISTINCT github_owner)::int AS owners,
      COUNT(DISTINCT github_owner || '/' || github_repo)::int AS repos
    FROM skills
    WHERE is_blocked = false
    GROUP BY
      CASE
        WHEN github_stars IS NULL OR github_stars = 0 THEN 0
        WHEN github_stars BETWEEN 1 AND 5 THEN 1
        WHEN github_stars BETWEEN 6 AND 10 THEN 2
        WHEN github_stars BETWEEN 11 AND 50 THEN 3
        WHEN github_stars BETWEEN 51 AND 100 THEN 4
        WHEN github_stars BETWEEN 101 AND 500 THEN 5
        WHEN github_stars BETWEEN 501 AND 1000 THEN 6
        WHEN github_stars BETWEEN 1001 AND 5000 THEN 7
        WHEN github_stars BETWEEN 5001 AND 10000 THEN 8
        WHEN github_stars BETWEEN 10001 AND 50000 THEN 9
        ELSE 10
      END,
      CASE
        WHEN github_stars IS NULL OR github_stars = 0 THEN '0 stars'
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
      END
    ORDER BY MIN(COALESCE(github_stars, 0))
  `);
  report.starsDist = starsRows.rows;
  table(starsRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 3. ENGAGEMENT DISTRIBUTION
  // ======================================================================
  header('3. ENGAGEMENT (Downloads & Views)');

  subHeader('Download Distribution');
  const dlRows = await db.execute(sql`
    SELECT
      CASE
        WHEN COALESCE(download_count, 0) = 0 THEN '0'
        WHEN download_count BETWEEN 1 AND 5 THEN '1-5'
        WHEN download_count BETWEEN 6 AND 10 THEN '6-10'
        WHEN download_count BETWEEN 11 AND 50 THEN '11-50'
        WHEN download_count BETWEEN 51 AND 100 THEN '51-100'
        WHEN download_count BETWEEN 101 AND 500 THEN '101-500'
        ELSE '500+'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(COALESCE(download_count, 0))
  `);
  report.downloadDist = dlRows.rows;
  table(dlRows.rows as Record<string, unknown>[]);

  subHeader('View Distribution');
  const vwRows = await db.execute(sql`
    SELECT
      CASE
        WHEN COALESCE(view_count, 0) = 0 THEN '0'
        WHEN view_count BETWEEN 1 AND 10 THEN '1-10'
        WHEN view_count BETWEEN 11 AND 50 THEN '11-50'
        WHEN view_count BETWEEN 51 AND 100 THEN '51-100'
        WHEN view_count BETWEEN 101 AND 500 THEN '101-500'
        WHEN view_count BETWEEN 501 AND 1000 THEN '501-1K'
        ELSE '1K+'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(COALESCE(view_count, 0))
  `);
  report.viewDist = vwRows.rows;
  table(vwRows.rows as Record<string, unknown>[]);

  subHeader('Top 20 Downloaded Skills');
  const topDL = await db.execute(sql`
    SELECT id, name, download_count AS downloads, view_count AS views,
           github_stars AS stars, github_owner AS owner
    FROM skills
    WHERE is_blocked = false AND COALESCE(download_count, 0) > 0
    ORDER BY download_count DESC LIMIT 20
  `);
  report.topDownloads = topDL.rows;
  table(topDL.rows as Record<string, unknown>[]);

  subHeader('Top 20 Viewed Skills');
  const topVW = await db.execute(sql`
    SELECT id, name, view_count AS views, download_count AS downloads,
           github_stars AS stars, github_owner AS owner
    FROM skills
    WHERE is_blocked = false AND COALESCE(view_count, 0) > 0
    ORDER BY view_count DESC LIMIT 20
  `);
  report.topViews = topVW.rows;
  table(topVW.rows as Record<string, unknown>[]);

  // ======================================================================
  // 4. SECURITY STATUS
  // ======================================================================
  header('4. SECURITY STATUS');

  const secRows = await db.execute(sql`
    SELECT
      COALESCE(security_status, 'null') AS status,
      COUNT(*)::int AS count,
      ROUND(COUNT(*)::numeric / NULLIF(${total}, 0) * 100, 1) AS pct
    FROM skills WHERE is_blocked = false
    GROUP BY security_status ORDER BY count DESC
  `);
  report.securityDist = secRows.rows;
  table(secRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 5. CONTENT ANALYSIS
  // ======================================================================
  header('5. CONTENT ANALYSIS');

  const csRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE raw_content IS NOT NULL)::int                           AS has_content,
      COUNT(*) FILTER (WHERE raw_content IS NULL)::int                               AS no_content,
      ROUND(AVG(LENGTH(raw_content)) FILTER (WHERE raw_content IS NOT NULL))::int    AS avg_content_len,
      MAX(LENGTH(raw_content))::int                                                  AS max_content_len,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(raw_content))
        FILTER (WHERE raw_content IS NOT NULL)::int                                  AS median_content_len,
      ROUND(AVG(LENGTH(description)))::int                                           AS avg_desc_len,
      COUNT(*) FILTER (WHERE LENGTH(description) > 100)::int                         AS good_desc,
      COUNT(*) FILTER (WHERE LENGTH(description) <= 20)::int                         AS short_desc,
      COUNT(*) FILTER (WHERE version IS NOT NULL)::int                               AS has_version,
      COUNT(*) FILTER (WHERE license IS NOT NULL)::int                               AS has_license,
      COUNT(*) FILTER (WHERE author IS NOT NULL)::int                                AS has_author,
      COUNT(*) FILTER (WHERE homepage IS NOT NULL)::int                              AS has_homepage
    FROM skills WHERE is_blocked = false
  `);
  const cs = csRows.rows[0] as Record<string, unknown>;
  report.contentStats = cs;

  console.log(`    Has raw_content:    ${num(cs.has_content)} (${pct(cs.has_content, total)})`);
  console.log(`    No raw_content:     ${num(cs.no_content)} (${pct(cs.no_content, total)})`);
  console.log(`    Avg content length: ${num(cs.avg_content_len)} chars`);
  console.log(`    Median content len: ${num(cs.median_content_len)} chars`);
  console.log(`    Max content length: ${num(cs.max_content_len)} chars`);
  console.log(`    Avg desc length:    ${num(cs.avg_desc_len)} chars`);
  console.log(`    Good desc (>100ch): ${num(cs.good_desc)} (${pct(cs.good_desc, total)})`);
  console.log(`    Short desc (<=20):  ${num(cs.short_desc)} (${pct(cs.short_desc, total)})`);
  console.log(`    Has version:        ${num(cs.has_version)} (${pct(cs.has_version, total)})`);
  console.log(`    Has license:        ${num(cs.has_license)} (${pct(cs.has_license, total)})`);
  console.log(`    Has author:         ${num(cs.has_author)} (${pct(cs.has_author, total)})`);
  console.log(`    Has homepage:       ${num(cs.has_homepage)} (${pct(cs.has_homepage, total)})`);

  subHeader('Content Length Distribution');
  const clRows = await db.execute(sql`
    SELECT
      CASE
        WHEN raw_content IS NULL THEN 'null'
        WHEN LENGTH(raw_content) = 0 THEN 'empty'
        WHEN LENGTH(raw_content) < 200 THEN '<200'
        WHEN LENGTH(raw_content) < 500 THEN '200-500'
        WHEN LENGTH(raw_content) < 1000 THEN '500-1K'
        WHEN LENGTH(raw_content) < 3000 THEN '1K-3K'
        WHEN LENGTH(raw_content) < 5000 THEN '3K-5K'
        WHEN LENGTH(raw_content) < 10000 THEN '5K-10K'
        WHEN LENGTH(raw_content) < 50000 THEN '10K-50K'
        ELSE '50K+'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(COALESCE(LENGTH(raw_content), -1))
  `);
  report.contentLenDist = clRows.rows;
  table(clRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 6. TRIGGERS & COMPATIBILITY
  // ======================================================================
  header('6. TRIGGERS & COMPATIBILITY');

  const trRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE triggers IS NOT NULL)::int                                AS has_triggers,
      COUNT(*) FILTER (WHERE triggers IS NULL)::int                                    AS no_triggers,
      COUNT(*) FILTER (WHERE triggers->>'filePatterns' IS NOT NULL
                        AND triggers->>'filePatterns' != '[]'
                        AND triggers->>'filePatterns' != 'null')::int                   AS has_file_patterns,
      COUNT(*) FILTER (WHERE triggers->>'keywords' IS NOT NULL
                        AND triggers->>'keywords' != '[]'
                        AND triggers->>'keywords' != 'null')::int                       AS has_keywords,
      COUNT(*) FILTER (WHERE triggers->>'languages' IS NOT NULL
                        AND triggers->>'languages' != '[]'
                        AND triggers->>'languages' != 'null')::int                      AS has_languages,
      COUNT(*) FILTER (WHERE compatibility IS NOT NULL)::int                            AS has_compat,
      COUNT(*) FILTER (WHERE compatibility->>'platforms' IS NOT NULL
                        AND compatibility->>'platforms' != '[]'
                        AND compatibility->>'platforms' != 'null')::int                  AS has_platforms,
      COUNT(*) FILTER (WHERE compatibility->>'requires' IS NOT NULL
                        AND compatibility->>'requires' != '[]'
                        AND compatibility->>'requires' != 'null')::int                  AS has_requires
    FROM skills WHERE is_blocked = false
  `);
  const tr = trRows.rows[0] as Record<string, unknown>;
  report.triggerStats = tr;

  console.log(`    Has triggers:       ${num(tr.has_triggers)} (${pct(tr.has_triggers, total)})`);
  console.log(`    No triggers:        ${num(tr.no_triggers)} (${pct(tr.no_triggers, total)})`);
  console.log(`    - filePatterns:     ${num(tr.has_file_patterns)}`);
  console.log(`    - keywords:         ${num(tr.has_keywords)}`);
  console.log(`    - languages:        ${num(tr.has_languages)}`);
  console.log(`    Has compatibility:  ${num(tr.has_compat)}`);
  console.log(`    - platforms:        ${num(tr.has_platforms)}`);
  console.log(`    - requires:         ${num(tr.has_requires)}`);

  // ======================================================================
  // 7. FRESHNESS
  // ======================================================================
  header('7. FRESHNESS & ACTIVITY');

  subHeader('Created At Distribution');
  const crRows = await db.execute(sql`
    SELECT
      CASE
        WHEN created_at > NOW() - INTERVAL '7 days' THEN 'Last 7d'
        WHEN created_at > NOW() - INTERVAL '30 days' THEN 'Last 30d'
        WHEN created_at > NOW() - INTERVAL '90 days' THEN 'Last 90d'
        WHEN created_at > NOW() - INTERVAL '180 days' THEN 'Last 180d'
        WHEN created_at > NOW() - INTERVAL '365 days' THEN 'Last 365d'
        ELSE 'Older'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(NOW() - created_at)
  `);
  report.createdDist = crRows.rows;
  table(crRows.rows as Record<string, unknown>[]);

  subHeader('Updated At Distribution');
  const upRows = await db.execute(sql`
    SELECT
      CASE
        WHEN updated_at > NOW() - INTERVAL '7 days' THEN 'Last 7d'
        WHEN updated_at > NOW() - INTERVAL '30 days' THEN 'Last 30d'
        WHEN updated_at > NOW() - INTERVAL '90 days' THEN 'Last 90d'
        WHEN updated_at > NOW() - INTERVAL '180 days' THEN 'Last 180d'
        WHEN updated_at > NOW() - INTERVAL '365 days' THEN 'Last 365d'
        ELSE 'Older'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(NOW() - updated_at)
  `);
  report.updatedDist = upRows.rows;
  table(upRows.rows as Record<string, unknown>[]);

  subHeader('Last Downloaded Distribution');
  const ldRows = await db.execute(sql`
    SELECT
      CASE
        WHEN last_downloaded_at IS NULL THEN 'Never'
        WHEN last_downloaded_at > NOW() - INTERVAL '7 days' THEN 'Last 7d'
        WHEN last_downloaded_at > NOW() - INTERVAL '30 days' THEN 'Last 30d'
        WHEN last_downloaded_at > NOW() - INTERVAL '90 days' THEN 'Last 90d'
        ELSE 'Older'
      END AS range,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY MIN(COALESCE(last_downloaded_at, '1970-01-01'::timestamp))
  `);
  report.lastDownDist = ldRows.rows;
  table(ldRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 8. TOP OWNERS
  // ======================================================================
  header('8. TOP OWNERS');

  subHeader('Top 30 Owners by Skill Count');
  const owRows = await db.execute(sql`
    SELECT
      github_owner AS owner,
      COUNT(*)::int AS skills,
      COUNT(DISTINCT github_repo)::int AS repos,
      MAX(github_stars)::int AS max_stars,
      COALESCE(SUM(download_count), 0)::int AS downloads,
      COALESCE(SUM(view_count), 0)::int AS views
    FROM skills WHERE is_blocked = false
    GROUP BY github_owner ORDER BY skills DESC LIMIT 30
  `);
  report.topOwnersByCount = owRows.rows;
  table(owRows.rows as Record<string, unknown>[]);

  subHeader('Top 20 Owners by Stars');
  const osRows = await db.execute(sql`
    SELECT
      github_owner AS owner,
      MAX(github_stars)::int AS max_stars,
      COUNT(*)::int AS skills,
      COUNT(DISTINCT github_repo)::int AS repos,
      COALESCE(SUM(download_count), 0)::int AS downloads
    FROM skills WHERE is_blocked = false
    GROUP BY github_owner ORDER BY max_stars DESC LIMIT 20
  `);
  report.topOwnersByStars = osRows.rows;
  table(osRows.rows as Record<string, unknown>[]);

  subHeader('Owner Concentration');
  const ocRows = await db.execute(sql`
    WITH ranked AS (
      SELECT github_owner, COUNT(*)::int AS cnt,
             ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
      FROM skills WHERE is_blocked = false
      GROUP BY github_owner
    )
    SELECT
      SUM(cnt) FILTER (WHERE rn <= 1)::int  AS top_1,
      SUM(cnt) FILTER (WHERE rn <= 5)::int  AS top_5,
      SUM(cnt) FILTER (WHERE rn <= 10)::int AS top_10,
      SUM(cnt) FILTER (WHERE rn <= 20)::int AS top_20,
      SUM(cnt) FILTER (WHERE rn <= 50)::int AS top_50,
      SUM(cnt)::int AS total,
      COUNT(*)::int AS owners
    FROM ranked
  `);
  const oc = ocRows.rows[0] as Record<string, unknown>;
  report.ownerConcentration = oc;

  console.log(`    Top 1 owner:   ${num(oc.top_1)} skills (${pct(oc.top_1, oc.total)})`);
  console.log(`    Top 5 owners:  ${num(oc.top_5)} skills (${pct(oc.top_5, oc.total)})`);
  console.log(`    Top 10 owners: ${num(oc.top_10)} skills (${pct(oc.top_10, oc.total)})`);
  console.log(`    Top 20 owners: ${num(oc.top_20)} skills (${pct(oc.top_20, oc.total)})`);
  console.log(`    Top 50 owners: ${num(oc.top_50)} skills (${pct(oc.top_50, oc.total)})`);
  console.log(`    Total owners:  ${num(oc.owners)}`);

  // ======================================================================
  // 9. MULTI-SKILL REPOS
  // ======================================================================
  header('9. MULTI-SKILL REPOS');

  subHeader('Repos with 20+ Skills (Aggregator Candidates)');
  const aggRows = await db.execute(sql`
    SELECT
      github_owner || '/' || github_repo AS repo,
      COUNT(*)::int AS skills,
      MAX(github_stars)::int AS stars,
      COALESCE(SUM(download_count), 0)::int AS downloads
    FROM skills WHERE is_blocked = false
    GROUP BY github_owner, github_repo
    HAVING COUNT(*) >= 20
    ORDER BY skills DESC LIMIT 30
  `);
  report.aggregatorCandidates = aggRows.rows;
  table(aggRows.rows as Record<string, unknown>[]);

  subHeader('Repos with 3-19 Skills (Collection Candidates)');
  const colRows = await db.execute(sql`
    SELECT
      github_owner || '/' || github_repo AS repo,
      COUNT(*)::int AS skills,
      MAX(github_stars)::int AS stars,
      COALESCE(SUM(download_count), 0)::int AS downloads
    FROM skills WHERE is_blocked = false
    GROUP BY github_owner, github_repo
    HAVING COUNT(*) BETWEEN 3 AND 19
    ORDER BY skills DESC LIMIT 30
  `);
  report.collectionCandidates = colRows.rows;
  table(colRows.rows as Record<string, unknown>[]);

  subHeader('Skills-per-Repo Distribution');
  const sprRows = await db.execute(sql`
    WITH rc AS (
      SELECT COUNT(*)::int AS cnt
      FROM skills WHERE is_blocked = false
      GROUP BY github_owner, github_repo
    )
    SELECT
      CASE
        WHEN cnt = 1 THEN '1 skill'
        WHEN cnt = 2 THEN '2 skills'
        WHEN cnt BETWEEN 3 AND 5 THEN '3-5'
        WHEN cnt BETWEEN 6 AND 10 THEN '6-10'
        WHEN cnt BETWEEN 11 AND 20 THEN '11-20'
        WHEN cnt BETWEEN 21 AND 50 THEN '21-50'
        WHEN cnt BETWEEN 51 AND 100 THEN '51-100'
        ELSE '100+'
      END AS per_repo,
      COUNT(*)::int AS repos,
      SUM(cnt)::int AS total_skills
    FROM rc
    GROUP BY 1 ORDER BY MIN(cnt)
  `);
  report.skillsPerRepo = sprRows.rows;
  table(sprRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 10. CATEGORY DISTRIBUTION
  // ======================================================================
  header('10. CATEGORY DISTRIBUTION');

  const catRows = await db.execute(sql`
    SELECT c.name AS category, c.skill_count::int AS skills, c.id
    FROM categories c
    WHERE c.id NOT LIKE 'parent-%'
    ORDER BY c.skill_count DESC
  `);
  report.categoryDist = catRows.rows;
  table(catRows.rows as Record<string, unknown>[]);

  const ncRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM skills s
    WHERE s.is_blocked = false
      AND NOT EXISTS (SELECT 1 FROM skill_categories sc WHERE sc.skill_id = s.id)
  `);
  report.uncategorizedCount = (ncRows.rows[0] as Record<string, unknown>)?.count;
  console.log(`\n    Skills with no category: ${num(report.uncategorizedCount)}`);

  // ======================================================================
  // 11. FLAGS & RATINGS
  // ======================================================================
  header('11. FLAGS & RATINGS');

  const flRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE is_verified = true)::int  AS verified,
      COUNT(*) FILTER (WHERE is_featured = true)::int  AS featured,
      COUNT(*) FILTER (WHERE rating IS NOT NULL)::int   AS has_rating,
      COUNT(*) FILTER (WHERE rating_count > 0)::int     AS has_user_ratings,
      ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL), 2)::numeric AS avg_rating,
      MAX(rating_count)::int AS max_rating_count
    FROM skills WHERE is_blocked = false
  `);
  const fl = flRows.rows[0] as Record<string, unknown>;
  report.flags = fl;

  console.log(`    Verified:         ${num(fl.verified)}`);
  console.log(`    Featured:         ${num(fl.featured)}`);
  console.log(`    Has rating:       ${num(fl.has_rating)}`);
  console.log(`    Has user ratings: ${num(fl.has_user_ratings)}`);
  console.log(`    Average rating:   ${fl.avg_rating ?? 'N/A'}`);
  console.log(`    Max rating count: ${num(fl.max_rating_count)}`);

  // ======================================================================
  // 12. CROSS-TABLE STATS
  // ======================================================================
  header('12. CROSS-TABLE STATS');

  const xtRows = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM ratings) AS ratings,
      (SELECT COUNT(*)::int FROM installations) AS installations,
      (SELECT COUNT(*)::int FROM favorites) AS favorites,
      (SELECT COUNT(*)::int FROM discovered_repos) AS discovered_repos,
      (SELECT COUNT(*) FILTER (WHERE has_skill_md = true)::int FROM discovered_repos) AS repos_with_skills,
      (SELECT COUNT(*)::int FROM removal_requests) AS removal_requests,
      (SELECT COUNT(*)::int FROM add_requests) AS add_requests,
      (SELECT COUNT(*) FILTER (WHERE unsubscribed_at IS NULL)::int FROM email_subscriptions) AS subscribers
  `);
  const xt = xtRows.rows[0] as Record<string, unknown>;
  report.crossStats = xt;

  console.log(`    Users:             ${num(xt.users)}`);
  console.log(`    Ratings:           ${num(xt.ratings)}`);
  console.log(`    Installations:     ${num(xt.installations)}`);
  console.log(`    Favorites:         ${num(xt.favorites)}`);
  console.log(`    Discovered repos:  ${num(xt.discovered_repos)}`);
  console.log(`    - with skills:     ${num(xt.repos_with_skills)}`);
  console.log(`    Removal requests:  ${num(xt.removal_requests)}`);
  console.log(`    Add requests:      ${num(xt.add_requests)}`);
  console.log(`    Subscribers:       ${num(xt.subscribers)}`);

  subHeader('Installations by Platform');
  const ipRows = await db.execute(sql`
    SELECT platform, COUNT(*)::int AS count
    FROM installations GROUP BY platform ORDER BY count DESC
  `);
  report.installByPlatform = ipRows.rows;
  table(ipRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 13. USABILITY SIGNALS
  // ======================================================================
  header('13. USABILITY SIGNALS FOR CURATION');

  const usRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE LENGTH(description) > 50
          AND raw_content IS NOT NULL AND LENGTH(raw_content) > 500
          AND security_status = 'pass'
      )::int AS strong_standalone,

      COUNT(*) FILTER (
        WHERE triggers IS NOT NULL AND triggers != '{}'::jsonb
          AND (triggers->>'filePatterns' IS NOT NULL AND triggers->>'filePatterns' != '[]')
      )::int AS has_file_triggers,

      COUNT(*) FILTER (WHERE COALESCE(download_count, 0) > 0)::int AS ever_downloaded,

      COUNT(*) FILTER (
        WHERE github_stars >= 10
          AND LENGTH(description) > 50
          AND raw_content IS NOT NULL
          AND security_status = 'pass'
      )::int AS high_quality,

      COUNT(*) FILTER (
        WHERE github_stars >= 100
          AND COALESCE(download_count, 0) > 0
          AND security_status = 'pass'
      )::int AS premium,

      COUNT(*) FILTER (
        WHERE source_format = 'skill.md'
          AND LENGTH(description) > 50
          AND raw_content IS NOT NULL AND LENGTH(raw_content) > 300
          AND security_status = 'pass'
      )::int AS skillmd_quality
    FROM skills WHERE is_blocked = false
  `);
  const us = usRows.rows[0] as Record<string, unknown>;
  report.usability = us;

  console.log(`    Strong standalone candidates:    ${num(us.strong_standalone)}`);
  console.log(`      (desc>50 + content>500 + security=pass)`);
  console.log(`    With file triggers:              ${num(us.has_file_triggers)}`);
  console.log(`    Ever downloaded:                 ${num(us.ever_downloaded)}`);
  console.log(`    High quality (stars>10+desc+sec): ${num(us.high_quality)}`);
  console.log(`    Premium (stars>100+dl>0+sec):     ${num(us.premium)}`);
  console.log(`    SKILL.md with quality:           ${num(us.skillmd_quality)}`);

  // ======================================================================
  // 14. STANDALONE vs PROJECT-BOUND
  // ======================================================================
  header('14. STANDALONE vs PROJECT-BOUND HEURISTIC');

  subHeader('Single vs Multi-Skill Repos');
  const smRows = await db.execute(sql`
    WITH rc AS (
      SELECT github_owner, github_repo, COUNT(*)::int AS cnt
      FROM skills WHERE is_blocked = false
      GROUP BY github_owner, github_repo
    )
    SELECT
      COUNT(*) FILTER (WHERE cnt = 1)::int AS single,
      COUNT(*) FILTER (WHERE cnt = 2)::int AS two,
      COUNT(*) FILTER (WHERE cnt >= 3)::int AS multi,
      COUNT(*)::int AS total
    FROM rc
  `);
  const sm = smRows.rows[0] as Record<string, unknown>;
  report.repoTypes = sm;

  console.log(`    Single-skill repos: ${num(sm.single)} (${pct(sm.single, sm.total)})`);
  console.log(`    Two-skill repos:    ${num(sm.two)} (${pct(sm.two, sm.total)})`);
  console.log(`    Multi-skill repos:  ${num(sm.multi)} (${pct(sm.multi, sm.total)})`);

  subHeader('Name Pattern Signals');
  const npRows = await db.execute(sql`
    SELECT
      CASE
        WHEN name ILIKE '%rule%' OR name ILIKE '%config%' OR name ILIKE '%setup%' THEN 'rules/config/setup'
        WHEN name ILIKE '%my-%' OR name ILIKE '%my_%' THEN 'starts with my-'
        WHEN name ILIKE '%cursor%' OR name ILIKE '%claude%' OR name ILIKE '%copilot%' THEN 'tool-specific'
        WHEN name ILIKE '%project%' OR name ILIKE '%team%' OR name ILIKE '%internal%' THEN 'project/team'
        WHEN name ILIKE '%.mdc' OR name ILIKE '%cursorrule%' THEN 'cursor rules file'
        ELSE 'generic/other'
      END AS pattern,
      COUNT(*)::int AS skills
    FROM skills WHERE is_blocked = false
    GROUP BY 1 ORDER BY skills DESC
  `);
  report.namePatterns = npRows.rows;
  table(npRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 15. SAMPLE SKILLS
  // ======================================================================
  header('15. SAMPLE SKILLS');

  subHeader('Top 15 by Stars');
  const tsRows = await db.execute(sql`
    SELECT id, name, github_stars AS stars, COALESCE(download_count,0) AS dl,
           security_status AS sec, source_format AS fmt,
           LEFT(description, 80) AS description
    FROM skills WHERE is_blocked = false
    ORDER BY github_stars DESC LIMIT 15
  `);
  report.topByStars = tsRows.rows;
  table(tsRows.rows as Record<string, unknown>[]);

  subHeader('Top 15 by Downloads (actually used)');
  const tdRows = await db.execute(sql`
    SELECT id, name, download_count AS dl, view_count AS views,
           github_stars AS stars, security_status AS sec,
           LEFT(description, 80) AS description
    FROM skills WHERE is_blocked = false AND COALESCE(download_count,0) > 0
    ORDER BY download_count DESC LIMIT 15
  `);
  report.topByDL = tdRows.rows;
  table(tdRows.rows as Record<string, unknown>[]);

  subHeader('SKILL.md + Stars>50 + Downloads>0');
  const qsRows = await db.execute(sql`
    SELECT id, name, github_stars AS stars, download_count AS dl,
           security_status AS sec, LEFT(description, 80) AS description
    FROM skills
    WHERE is_blocked = false AND source_format = 'skill.md'
      AND github_stars >= 50 AND COALESCE(download_count, 0) > 0
    ORDER BY github_stars DESC LIMIT 20
  `);
  report.qualitySkillMd = qsRows.rows;
  table(qsRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 16. DISCOVERED REPOS
  // ======================================================================
  header('16. DISCOVERED REPOS');

  const drRows = await db.execute(sql`
    SELECT
      discovered_via AS source,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE has_skill_md = true)::int AS with_skills,
      COUNT(*) FILTER (WHERE last_scanned IS NOT NULL)::int AS scanned,
      COUNT(*) FILTER (WHERE is_archived = true)::int AS archived
    FROM discovered_repos
    GROUP BY discovered_via ORDER BY total DESC
  `);
  report.discoveredStats = drRows.rows;
  table(drRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 17. CACHED FILES
  // ======================================================================
  header('17. CACHED FILES');

  const cfRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE cached_files IS NOT NULL)::int AS has_cache,
      COUNT(*) FILTER (WHERE cached_files IS NULL)::int     AS no_cache
    FROM skills WHERE is_blocked = false
  `);
  const cf = cfRows.rows[0] as Record<string, unknown>;
  report.cacheStats = cf;

  console.log(`    Has cached files:  ${num(cf.has_cache)} (${pct(cf.has_cache, total)})`);
  console.log(`    No cached files:   ${num(cf.no_cache)} (${pct(cf.no_cache, total)})`);

  // ======================================================================
  // 19. BRANCH DISTRIBUTION
  // ======================================================================
  header('19. BRANCH DISTRIBUTION');

  const brRows = await db.execute(sql`
    SELECT COALESCE(branch, 'null') AS branch, COUNT(*)::int AS count
    FROM skills WHERE is_blocked = false
    GROUP BY branch ORDER BY count DESC LIMIT 10
  `);
  report.branchDist = brRows.rows;
  table(brRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // 20. DUPLICATES
  // ======================================================================
  header('20. POTENTIAL DUPLICATES');

  subHeader('Same Name + Description');
  const ddRows = await db.execute(sql`
    SELECT name, LEFT(description, 60) AS desc, COUNT(*)::int AS occurrences,
           STRING_AGG(DISTINCT github_owner, ', ') AS owners
    FROM skills
    WHERE is_blocked = false AND description IS NOT NULL AND LENGTH(description) > 10
    GROUP BY name, description HAVING COUNT(*) > 1
    ORDER BY occurrences DESC LIMIT 15
  `);
  report.exactDupes = ddRows.rows;
  table(ddRows.rows as Record<string, unknown>[]);

  subHeader('Same Content Hash (identical content, 3+ copies)');
  const chRows = await db.execute(sql`
    SELECT content_hash, COUNT(*)::int AS copies,
           MIN(name) AS sample_name,
           STRING_AGG(DISTINCT github_owner, ', ') AS owners
    FROM skills
    WHERE is_blocked = false AND content_hash IS NOT NULL
    GROUP BY content_hash HAVING COUNT(*) > 2
    ORDER BY copies DESC LIMIT 15
  `);
  report.hashDupes = chRows.rows;
  table(chRows.rows as Record<string, unknown>[]);

  // ======================================================================
  // DONE
  // ======================================================================
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  header(`EXPLORATION COMPLETE (${duration}s)`);

  console.log(`
  KEY QUESTIONS TO ANSWER:
  1. What % of skills are SKILL.md vs other formats?
  2. What % have been downloaded at least once? (real usage)
  3. How concentrated is ownership? (top 10 owners = ?%)
  4. How many multi-skill repos? (collection/aggregator candidates)
  5. How many pass security + have good content? (curation-ready)
  6. How many duplicates exist?
  `);

  // Save JSON report
  report.generatedAt = new Date().toISOString();
  report.durationSeconds = parseFloat(duration);

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const reportPath = resolve(scriptDir, 'explore-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  Full report saved to: ${reportPath}`);

  await closeDb();
}

// ─── Run ───────────────────────────────────────────────────────────────────────
runExploration().catch(async (err) => {
  console.error('Exploration failed:', err);
  await closeDb();
  process.exit(1);
});
