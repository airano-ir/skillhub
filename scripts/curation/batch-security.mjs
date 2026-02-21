#!/usr/bin/env node
/**
 * Phase 4: Batch Security Scan
 *
 * Scans browse-ready skills for security issues using scanSecurity() from skillhub-core.
 * Updates: security_score, security_status, last_scanned, review_status → 'auto-scored'
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/curation/batch-security.mjs
 *
 * Options:
 *   --dry-run        Show what would change without writing
 *   --batch-size=N   Process N skills per batch (default 100)
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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

// ─── Find skillhub-core (ESM-only — use direct path import) ───
let scanSecurity;
const corePaths = [
  resolve(__dirname, '../../packages/core/dist/index.js'),
  resolve(__dirname, '../../node_modules/skillhub-core/dist/index.js'),
  resolve(__dirname, '../../services/indexer/node_modules/skillhub-core/dist/index.js'),
];
for (const p of corePaths) {
  try {
    const core = await import(pathToFileURL(p).href);
    scanSecurity = core.scanSecurity;
    break;
  } catch {}
}
if (!scanSecurity) { console.error('skillhub-core not found. Run: pnpm build'); process.exit(1); }

// ─── Config ───
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillhub';
const DRY_RUN = process.argv.includes('--dry-run');
const batchArg = process.argv.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 100;

// ─── Helpers ───
const n = v => Number(v ?? 0).toLocaleString('en-US');

function progress(current, total) {
  const pct = ((current / total) * 100).toFixed(1);
  process.stdout.write(`\r  Processing ${n(current)} / ${n(total)} (${pct}%)`);
}

// ─── Database ───
let client;

async function connect() {
  client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: false,
    connectionTimeoutMillis: 15000,
    query_timeout: 600000,
    keepAlive: true,
  });
  await client.connect();
  console.log('Connected to database');
}

async function query(sql, params = []) {
  return client.query(sql, params);
}

// ─── Extract scripts from cached_files ───
function extractScripts(cachedFiles) {
  if (!cachedFiles || !cachedFiles.items) return [];
  return cachedFiles.items
    .filter(item =>
      !item.isBinary &&
      item.name !== 'SKILL.md' &&
      (item.name.endsWith('.sh') ||
       item.name.endsWith('.py') ||
       item.name.endsWith('.js') ||
       item.name.endsWith('.ts') ||
       item.name.endsWith('.ps1') ||
       item.name.endsWith('.bat') ||
       item.name.endsWith('.rb'))
    )
    .map(item => ({ name: item.name, content: item.content }));
}

// ─── Main ───
async function main() {
  const t0 = Date.now();
  await connect();

  console.log(`\n${'='.repeat(70)}`);
  console.log('  BATCH SECURITY SCAN (Phase 4)');
  console.log(`${'='.repeat(70)}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN MODE — no changes will be made ***\n');

  // Count skills to scan
  const countResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM skills
    WHERE is_blocked = false
      AND is_duplicate = false
      AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
      AND security_status IS NULL
      AND raw_content IS NOT NULL
  `);
  const total = countResult.rows[0].total;
  console.log(`  Skills to scan: ${n(total)}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);

  if (total === 0) {
    console.log('  Nothing to do — all browse-ready skills already scanned');
    await client.end().catch(() => {});
    return;
  }

  if (DRY_RUN) {
    // Show sample
    const sample = await query(`
      SELECT id, LEFT(name, 50) AS name
      FROM skills
      WHERE is_blocked = false
        AND is_duplicate = false
        AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
        AND security_status IS NULL
        AND raw_content IS NOT NULL
      LIMIT 5
    `);
    console.log('\n  Sample skills that would be scanned:');
    for (const r of sample.rows) {
      console.log(`    ${r.id} — ${r.name}`);
    }
    console.log(`\n  [DRY RUN] Would scan ${n(total)} skills`);
    await client.end().catch(() => {});
    return;
  }

  // Process in batches
  let processed = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let errorCount = 0;
  let totalScore = 0;

  while (processed < total) {
    const batch = await query(`
      SELECT id, raw_content, cached_files
      FROM skills
      WHERE is_blocked = false
        AND is_duplicate = false
        AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
        AND security_status IS NULL
        AND raw_content IS NOT NULL
      ORDER BY github_stars DESC NULLS LAST
      LIMIT $1
    `, [BATCH_SIZE]);

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      try {
        const scripts = extractScripts(row.cached_files);
        const report = scanSecurity({ content: row.raw_content, scripts });

        await query(`
          UPDATE skills
          SET security_score = $1,
              security_status = $2,
              last_scanned = NOW(),
              review_status = CASE
                WHEN review_status IS NULL OR review_status = 'unreviewed'
                THEN 'auto-scored'
                ELSE review_status
              END
          WHERE id = $3
        `, [report.score, report.status, row.id]);

        totalScore += report.score;
        if (report.status === 'pass') passCount++;
        else if (report.status === 'warning') warnCount++;
        else failCount++;
      } catch (err) {
        errorCount++;
        if (errorCount <= 5) {
          console.error(`\n  Error scanning ${row.id}: ${err.message}`);
        }
      }

      processed++;
      if (processed % 100 === 0 || processed === total) {
        progress(processed, total);
      }
    }
  }

  console.log('\n'); // Clear progress line

  // Summary
  const avgScore = processed > 0 ? (totalScore / (processed - errorCount)).toFixed(1) : 0;
  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  SECURITY SCAN SUMMARY                              │
  ├─────────────────────────────────────────────────────┤
  │  Total scanned:     ${n(processed).padStart(8)}                      │
  │  Errors (skipped):  ${n(errorCount).padStart(8)}                      │
  ├─────────────────────────────────────────────────────┤
  │  PASS:              ${n(passCount).padStart(8)}                      │
  │  WARNING:           ${n(warnCount).padStart(8)}                      │
  │  FAIL:              ${n(failCount).padStart(8)}                      │
  ├─────────────────────────────────────────────────────┤
  │  Avg security score:${avgScore.toString().padStart(8)}                      │
  └─────────────────────────────────────────────────────┘
  `);

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Completed in ${dur}s`);

  await client.end().catch(() => {});
}

main().catch(async e => {
  console.error('FAILED:', e.message || e);
  await client?.end().catch(() => {});
  process.exit(1);
});
