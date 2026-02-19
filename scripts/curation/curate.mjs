#!/usr/bin/env node
/**
 * Phase 2: Data Cleanup & Classification
 *
 * Runs all curation steps in order:
 *   Step 1: Compute repo_skill_count for every skill
 *   Step 2: Mark aggregators (repos with 50+ skills)
 *   Step 3: Classify remaining repos (collection / standalone / project-bound)
 *   Step 4: Fill missing content_hash values
 *   Step 5: Mark duplicates by content_hash (canonical = highest stars or oldest)
 *   Step 6: Detect fork marketplace repos
 *   Step 7: Recalculate category skill counts (browse-ready only)
 *   Step 8: Summary report
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/curation/curate.mjs
 *   # Or with local Docker:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/skillhub node scripts/curation/curate.mjs
 *
 * Options:
 *   --dry-run    Show what would change without writing
 *   --step=N     Run only step N (1-8)
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Find pg module ───
let pg;
const tryPaths = [
  resolve(__dirname, '../..', 'package.json'),
  '/tmp/package.json',
  process.env.APPDATA ? resolve(process.env.APPDATA, '..', 'Local', 'Temp', 'package.json') : null,
].filter(Boolean);
for (const p of tryPaths) {
  try { pg = createRequire(p)('pg'); break; } catch {}
}
if (!pg) { console.error('pg not found. Run: npm install pg'); process.exit(1); }

// ─── Config ───
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillhub';
const DRY_RUN = process.argv.includes('--dry-run');
const stepArg = process.argv.find(a => a.startsWith('--step='));
const ONLY_STEP = stepArg ? parseInt(stepArg.split('=')[1]) : null;

// ─── Helpers ───
function header(step, title) {
  console.log(`\n${'='.repeat(70)}\n  STEP ${step}: ${title}\n${'='.repeat(70)}`);
}

const n = v => Number(v ?? 0).toLocaleString('en-US');

// ─── Database ───
let client;

async function connect() {
  client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: false,
    connectionTimeoutMillis: 15000,
    query_timeout: 600000, // 10 min for big updates
    keepAlive: true,
  });
  await client.connect();
  console.log('Connected to database');
}

async function query(sql, params = []) {
  const result = await client.query(sql, params);
  return result;
}

// ─── Step 1: Compute repo_skill_count ───
async function step1_repoSkillCount() {
  header(1, 'COMPUTE repo_skill_count');

  const countResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM skills
    WHERE is_blocked = false AND repo_skill_count IS NULL
  `);
  console.log(`  Skills without repo_skill_count: ${n(countResult.rows[0].total)}`);

  if (DRY_RUN) { console.log('  [DRY RUN] Would update all skills'); return; }

  const result = await query(`
    UPDATE skills s SET repo_skill_count = sub.cnt
    FROM (
      SELECT github_owner, github_repo, COUNT(*)::int AS cnt
      FROM skills WHERE is_blocked = false
      GROUP BY github_owner, github_repo
    ) sub
    WHERE s.github_owner = sub.github_owner
      AND s.github_repo = sub.github_repo
      AND s.is_blocked = false
  `);
  console.log(`  Updated: ${n(result.rowCount)} skills`);
}

// ─── Step 2: Mark aggregators ───
async function step2_markAggregators() {
  header(2, 'MARK AGGREGATORS (repos with 50+ skills)');

  // Preview
  const preview = await query(`
    SELECT github_owner || '/' || github_repo AS repo, COUNT(*)::int AS skills,
           MAX(github_stars)::int AS stars
    FROM skills WHERE is_blocked = false
    GROUP BY github_owner, github_repo
    HAVING COUNT(*) >= 50
    ORDER BY skills DESC LIMIT 20
  `);
  console.log(`  Top aggregator repos (${preview.rowCount} total):`);
  for (const r of preview.rows.slice(0, 10)) {
    console.log(`    ${r.repo}: ${n(r.skills)} skills (${n(r.stars)} stars)`);
  }

  if (DRY_RUN) { console.log('  [DRY RUN] Would mark skills in these repos'); return; }

  const result = await query(`
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
      AND s.skill_type IS NULL
  `);
  console.log(`  Marked as aggregator: ${n(result.rowCount)} skills`);
}

// ─── Step 3: Classify remaining repos ───
async function step3_classifyRemaining() {
  header(3, 'CLASSIFY REMAINING REPOS');

  // 3a: repos with 10-49 skills, name contains marketplace/awesome/collection → aggregator
  if (!DRY_RUN) {
    const aggByName = await query(`
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
        AND s.skill_type IS NULL
    `);
    console.log(`  Aggregator by name (10+ & marketplace/awesome/registry): ${n(aggByName.rowCount)}`);
  }

  // 3b: repos with 3-49 skills → collection
  if (!DRY_RUN) {
    const collections = await query(`
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
        AND s.skill_type IS NULL
    `);
    console.log(`  Collection (3+ skills in repo): ${n(collections.rowCount)}`);
  }

  // 3c: single/two-skill repos with project-bound name patterns → project-bound
  if (!DRY_RUN) {
    const projectBound = await query(`
      UPDATE skills SET skill_type = 'project-bound'
      WHERE is_blocked = false AND skill_type IS NULL
        AND repo_skill_count <= 2
        AND (name ILIKE '%my-%' OR name ILIKE '%my\\_%' ESCAPE '\\'
          OR name ILIKE '%project%' OR name ILIKE '%team%' OR name ILIKE '%internal%'
          OR name ILIKE '%.mdc' OR name ILIKE '%cursorrule%'
          OR name ILIKE '%config%' OR name ILIKE '%setup%')
    `);
    console.log(`  Project-bound (name pattern): ${n(projectBound.rowCount)}`);
  }

  // 3d: remaining → standalone
  if (!DRY_RUN) {
    const standalone = await query(`
      UPDATE skills SET skill_type = 'standalone'
      WHERE is_blocked = false AND skill_type IS NULL
    `);
    console.log(`  Standalone (remaining): ${n(standalone.rowCount)}`);
  }

  // Summary
  const summary = await query(`
    SELECT skill_type, COUNT(*)::int AS count
    FROM skills WHERE is_blocked = false
    GROUP BY skill_type ORDER BY count DESC
  `);
  console.log('\n  Classification summary:');
  for (const r of summary.rows) {
    console.log(`    ${(r.skill_type || 'null').padEnd(15)} ${n(r.count)}`);
  }
}

// ─── Step 4: Fill missing content_hash ───
async function step4_fillContentHash() {
  header(4, 'FILL MISSING content_hash');

  const countResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM skills WHERE is_blocked = false AND content_hash IS NULL AND raw_content IS NOT NULL
  `);
  const missing = countResult.rows[0].total;
  console.log(`  Skills missing content_hash: ${n(missing)}`);

  if (missing === 0) { console.log('  Nothing to do'); return; }
  if (DRY_RUN) { console.log('  [DRY RUN] Would compute hash for these skills'); return; }

  // Use md5 as a reliable hash function available in PostgreSQL
  const result = await query(`
    UPDATE skills SET content_hash = md5(raw_content)
    WHERE is_blocked = false AND content_hash IS NULL AND raw_content IS NOT NULL
  `);
  console.log(`  Computed content_hash (md5) for: ${n(result.rowCount)} skills`);

  // Note: existing hashes use a JS numeric hash (analyzer.ts hashContent).
  // We now use md5 for missing ones. For dedup purposes, same content → same hash
  // regardless of algorithm, since we compare within hash groups.
  // But mixed algorithms mean same content could have different hashes.
  // Solution: re-hash ALL with md5 for consistency.
  console.log('  Re-hashing ALL skills with md5 for consistency...');
  const rehash = await query(`
    UPDATE skills SET content_hash = md5(raw_content)
    WHERE is_blocked = false AND raw_content IS NOT NULL
  `);
  console.log(`  Re-hashed: ${n(rehash.rowCount)} skills`);
}

// ─── Step 5: Mark duplicates ───
async function step5_markDuplicates() {
  header(5, 'MARK DUPLICATES BY content_hash');

  // Find duplicate groups
  const dupGroups = await query(`
    SELECT content_hash, COUNT(*)::int AS copies
    FROM skills
    WHERE is_blocked = false AND content_hash IS NOT NULL AND is_duplicate = false
    GROUP BY content_hash
    HAVING COUNT(*) > 1
    ORDER BY copies DESC
  `);
  const totalDupGroups = dupGroups.rowCount;
  const totalDupSkills = dupGroups.rows.reduce((sum, r) => sum + r.copies, 0);
  const removable = dupGroups.rows.reduce((sum, r) => sum + r.copies - 1, 0);

  console.log(`  Duplicate groups: ${n(totalDupGroups)}`);
  console.log(`  Total skills in dup groups: ${n(totalDupSkills)}`);
  console.log(`  Removable (keeping 1 per group): ${n(removable)}`);
  console.log(`  Top 5 by copies:`);
  for (const r of dupGroups.rows.slice(0, 5)) {
    console.log(`    hash=${r.content_hash}: ${r.copies} copies`);
  }

  if (DRY_RUN) { console.log('  [DRY RUN] Would mark duplicates'); return; }

  // For each duplicate group:
  // - canonical = highest github_stars, then oldest created_at
  // - rest = is_duplicate = true, canonical_skill_id = canonical.id
  const markResult = await query(`
    WITH ranked AS (
      SELECT id, content_hash,
             ROW_NUMBER() OVER (
               PARTITION BY content_hash
               ORDER BY github_stars DESC NULLS LAST,
                        created_at ASC
             ) AS rn
      FROM skills
      WHERE is_blocked = false AND content_hash IS NOT NULL AND is_duplicate = false
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
      AND r.rn > 1
  `);
  console.log(`  Marked as duplicate: ${n(markResult.rowCount)} skills`);

  // Verify
  const verify = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_duplicate = false)::int AS unique_skills,
      COUNT(*) FILTER (WHERE is_duplicate = true)::int AS duplicates
    FROM skills WHERE is_blocked = false
  `);
  console.log(`  After dedup: ${n(verify.rows[0].unique_skills)} unique, ${n(verify.rows[0].duplicates)} duplicates`);
}

// ─── Step 6: Detect fork marketplace repos ───
async function step6_detectForks() {
  header(6, 'DETECT FORK MARKETPLACE REPOS');

  // Known fork patterns: repos with same name across many owners
  const forkPatterns = await query(`
    SELECT github_repo, COUNT(DISTINCT github_owner)::int AS owners,
           COUNT(*)::int AS total_skills
    FROM skills
    WHERE is_blocked = false
      AND repo_skill_count >= 20
    GROUP BY github_repo
    HAVING COUNT(DISTINCT github_owner) >= 3
    ORDER BY owners DESC
  `);

  console.log(`  Repo names appearing in 3+ owners (with 20+ skills each):`);
  for (const r of forkPatterns.rows) {
    console.log(`    ${r.github_repo}: ${r.owners} owners, ${n(r.total_skills)} skills`);
  }

  if (DRY_RUN) { console.log('  [DRY RUN] Would mark fork repo skills'); return; }

  // For fork repos, all copies should be checked as duplicates
  // The canonical is already handled by step 5 (content_hash dedup)
  // Here we just ensure they're typed correctly as aggregator
  if (forkPatterns.rows.length > 0) {
    const repoNames = forkPatterns.rows.map(r => r.github_repo);
    const placeholders = repoNames.map((_, i) => `$${i + 1}`).join(',');
    const markForks = await query(`
      UPDATE skills SET skill_type = 'aggregator'
      WHERE is_blocked = false
        AND github_repo IN (${placeholders})
        AND repo_skill_count >= 20
        AND (skill_type IS NULL OR skill_type != 'aggregator')
    `, repoNames);
    console.log(`  Re-classified as aggregator (fork repos): ${n(markForks.rowCount)}`);
  }
}

// ─── Step 7: Recalculate category counts ───
async function step7_categoryCounts() {
  header(7, 'RECALCULATE CATEGORY COUNTS');

  // Update skill_count on each category to only count browse-ready skills
  const result = await query(`
    UPDATE categories c
    SET skill_count = sub.cnt
    FROM (
      SELECT sc.category_id, COUNT(*)::int AS cnt
      FROM skill_categories sc
      JOIN skills s ON sc.skill_id = s.id
      WHERE s.is_blocked = false
        AND s.is_duplicate = false
        AND (s.skill_type IS NULL OR s.skill_type != 'aggregator')
      GROUP BY sc.category_id
    ) sub
    WHERE c.id = sub.category_id
      AND c.skill_count IS DISTINCT FROM sub.cnt
  `);
  console.log(`  Updated ${result.rowCount} category counts (browse-ready only)`);

  // Also zero out categories that have no browse-ready skills
  const zeroResult = await query(`
    UPDATE categories c
    SET skill_count = 0
    WHERE c.skill_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM skill_categories sc
        JOIN skills s ON sc.skill_id = s.id
        WHERE sc.category_id = c.id
          AND s.is_blocked = false
          AND s.is_duplicate = false
          AND (s.skill_type IS NULL OR s.skill_type != 'aggregator')
      )
  `);
  if (zeroResult.rowCount > 0) {
    console.log(`  Zeroed ${zeroResult.rowCount} categories with no browse-ready skills`);
  }

  // Show category counts
  const cats = await query(`
    SELECT name, skill_count FROM categories
    WHERE id NOT LIKE 'parent-%'
    ORDER BY skill_count DESC
    LIMIT 10
  `);
  console.log('  Top 10 categories by browse-ready count:');
  for (const r of cats.rows) {
    console.log(`    ${n(r.skill_count).padStart(6)}  ${r.name}`);
  }
}

// ─── Step 8: Summary ───
async function step8_summary() {
  header(8, 'FINAL SUMMARY');

  const summary = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_duplicate = false)::int AS unique_skills,
      COUNT(*) FILTER (WHERE is_duplicate = true)::int AS duplicates,
      COUNT(*) FILTER (WHERE skill_type = 'standalone' AND is_duplicate = false)::int AS standalone,
      COUNT(*) FILTER (WHERE skill_type = 'collection' AND is_duplicate = false)::int AS collection,
      COUNT(*) FILTER (WHERE skill_type = 'aggregator' AND is_duplicate = false)::int AS aggregator,
      COUNT(*) FILTER (WHERE skill_type = 'project-bound' AND is_duplicate = false)::int AS project_bound,
      COUNT(*) FILTER (WHERE skill_type IS NULL AND is_duplicate = false)::int AS unclassified
    FROM skills WHERE is_blocked = false
  `);
  const s = summary.rows[0];

  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  CURATION SUMMARY                                   │
  ├─────────────────────────────────────────────────────┤
  │  Total skills:        ${n(s.total).padStart(8)}                      │
  │  Unique skills:       ${n(s.unique_skills).padStart(8)}                      │
  │  Duplicates:          ${n(s.duplicates).padStart(8)}                      │
  ├─────────────────────────────────────────────────────┤
  │  Unique by type:                                    │
  │    Standalone:        ${n(s.standalone).padStart(8)}                      │
  │    Collection:        ${n(s.collection).padStart(8)}                      │
  │    Aggregator:        ${n(s.aggregator).padStart(8)}                      │
  │    Project-bound:     ${n(s.project_bound).padStart(8)}                      │
  │    Unclassified:      ${n(s.unclassified).padStart(8)}                      │
  └─────────────────────────────────────────────────────┘
  `);

  // Interesting standalone skills
  const topStandalone = await query(`
    SELECT id, name, github_stars AS stars, COALESCE(download_count,0) AS dl,
           LEFT(description, 70) AS description
    FROM skills
    WHERE is_blocked = false AND is_duplicate = false
      AND skill_type = 'standalone'
    ORDER BY github_stars DESC NULLS LAST
    LIMIT 20
  `);
  console.log('  Top 20 standalone skills by stars:');
  for (const r of topStandalone.rows) {
    console.log(`    [${n(r.stars)}★ ${n(r.dl)}↓] ${r.id}`);
    console.log(`      ${r.description}`);
  }

  // Browse-ready count (what users would see)
  const browseReady = await query(`
    SELECT COUNT(*)::int AS count
    FROM skills
    WHERE is_blocked = false
      AND is_duplicate = false
      AND skill_type IN ('standalone', 'collection')
  `);
  console.log(`\n  Browse-ready skills (standalone + collection, unique): ${n(browseReady.rows[0].count)}`);
}

// ─── Main ───
async function main() {
  const t0 = Date.now();
  await connect();

  if (DRY_RUN) console.log('\n  *** DRY RUN MODE — no changes will be made ***\n');

  const steps = [
    step1_repoSkillCount,
    step2_markAggregators,
    step3_classifyRemaining,
    step4_fillContentHash,
    step5_markDuplicates,
    step6_detectForks,
    step7_categoryCounts,
    step8_summary,
  ];

  for (let i = 0; i < steps.length; i++) {
    if (ONLY_STEP && ONLY_STEP !== i + 1) continue;
    await steps[i]();
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nCompleted in ${dur}s`);

  await client.end().catch(() => {});
}

main().catch(async e => {
  console.error('FAILED:', e.message || e);
  await client?.end().catch(() => {});
  process.exit(1);
});
