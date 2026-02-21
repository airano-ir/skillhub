#!/usr/bin/env node
/**
 * Phase 5: Batch Quality Score
 *
 * Calculates quality scores for browse-ready skills using the same logic
 * as SkillAnalyzer.calculateQuality() from services/indexer/src/analyzer.ts.
 *
 * Updates: quality_score, quality_details, review_status → 'auto-scored'
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/curation/batch-score.mjs
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
let parseSkillMd, parseGenericInstructionFile, validateSkill, scanSecurity;
const corePaths = [
  resolve(__dirname, '../../packages/core/dist/index.js'),
  resolve(__dirname, '../../node_modules/skillhub-core/dist/index.js'),
  resolve(__dirname, '../../services/indexer/node_modules/skillhub-core/dist/index.js'),
];
for (const p of corePaths) {
  try {
    const core = await import(pathToFileURL(p).href);
    parseSkillMd = core.parseSkillMd;
    parseGenericInstructionFile = core.parseGenericInstructionFile;
    validateSkill = core.validateSkill;
    scanSecurity = core.scanSecurity;
    break;
  } catch {}
}
if (!parseSkillMd) { console.error('skillhub-core not found. Run: pnpm build'); process.exit(1); }

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

// ─── Quality scoring (mirrors SkillAnalyzer.calculateQuality) ───

function scoreDocumentation(skill, scripts, references) {
  let score = 0;

  // Has description (required)
  if (skill.metadata.description && skill.metadata.description.length > 20) {
    score += 20;
  }

  // Content length and structure
  const contentLength = skill.content.length;
  if (contentLength > 500) score += 15;
  else if (contentLength > 200) score += 10;
  else if (contentLength > 50) score += 5;

  // Has headers (good structure)
  const headerCount = (skill.content.match(/^#+\s/gm) || []).length;
  if (headerCount >= 3) score += 15;
  else if (headerCount >= 1) score += 10;

  // Has code examples
  if (skill.content.includes('```')) {
    score += 15;
  }

  // Has version
  if (skill.metadata.version) {
    score += 10;
  }

  // Has license
  if (skill.metadata.license) {
    score += 5;
  }

  // Has compatibility info
  if (skill.metadata.compatibility?.platforms?.length) {
    score += 10;
  }

  // Has scripts
  if (scripts.length > 0) {
    score += 5;
  }

  // Has references
  if (references.length > 0) {
    score += 5;
  }

  return Math.min(100, score);
}

function scoreMaintenance(repoMeta) {
  let score = 0;

  // Check last update time
  const lastUpdate = new Date(repoMeta.updatedAt);
  const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate < 30) score += 40;
  else if (daysSinceUpdate < 90) score += 30;
  else if (daysSinceUpdate < 180) score += 20;
  else if (daysSinceUpdate < 365) score += 10;

  // Has license
  if (repoMeta.license) {
    score += 20;
  }

  // Has description
  if (repoMeta.description) {
    score += 10;
  }

  // Has topics (always [] since not in DB — will miss ~10 points)
  if (repoMeta.topics.length > 0) {
    score += 10;
  }

  // Activity level (forks indicate usage)
  if (repoMeta.forks >= 10) score += 20;
  else if (repoMeta.forks >= 5) score += 15;
  else if (repoMeta.forks >= 1) score += 10;

  return Math.min(100, score);
}

function scorePopularity(repoMeta) {
  const stars = repoMeta.stars;
  const forks = repoMeta.forks;

  let score = 0;

  if (stars >= 1000) score += 50;
  else if (stars >= 100) score += 40;
  else if (stars >= 50) score += 30;
  else if (stars >= 10) score += 20;
  else if (stars >= 5) score += 10;
  else if (stars >= 1) score += 5;

  if (forks >= 50) score += 30;
  else if (forks >= 10) score += 20;
  else if (forks >= 5) score += 15;
  else if (forks >= 1) score += 10;

  // Bonus for relevant topics (always [] from DB — will miss ~20 points)
  const relevantTopics = ['ai', 'agent', 'skill', 'claude', 'copilot', 'codex', 'llm'];
  const hasRelevantTopic = repoMeta.topics.some(t =>
    relevantTopics.some(rt => t.toLowerCase().includes(rt))
  );
  if (hasRelevantTopic) {
    score += 20;
  }

  return Math.min(100, score);
}

function calculateQuality(skill, repoMeta, securityScore, validation, scripts, references) {
  const factors = [];

  // Documentation quality (30% weight)
  const docScore = scoreDocumentation(skill, scripts, references);
  factors.push({ name: 'documentation', score: docScore, weight: 0.3 });

  // Maintenance signals (25% weight)
  const maintScore = scoreMaintenance(repoMeta);
  factors.push({ name: 'maintenance', score: maintScore, weight: 0.25 });

  // Popularity (20% weight)
  const popScore = scorePopularity(repoMeta);
  factors.push({ name: 'popularity', score: popScore, weight: 0.2 });

  // Security (15% weight)
  factors.push({ name: 'security', score: securityScore, weight: 0.15 });

  // Validation (10% weight)
  const valScore = validation.isValid ? 100 : Math.max(0, 100 - validation.errors.length * 20);
  factors.push({ name: 'validation', score: valScore, weight: 0.1 });

  // Calculate weighted overall score
  const overall = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  return {
    overall,
    documentation: docScore,
    maintenance: maintScore,
    popularity: popScore,
    factors,
  };
}

// ─── Extract scripts/references from cached_files ───
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

function extractReferences(cachedFiles) {
  if (!cachedFiles || !cachedFiles.items) return [];
  return cachedFiles.items
    .filter(item =>
      !item.isBinary &&
      item.name !== 'SKILL.md' &&
      (item.name.endsWith('.md') || item.name.endsWith('.txt'))
    )
    .map(item => ({ name: item.name, content: item.content }));
}

// ─── Main ───
async function main() {
  const t0 = Date.now();
  await connect();

  console.log(`\n${'='.repeat(70)}`);
  console.log('  BATCH QUALITY SCORE (Phase 5)');
  console.log(`${'='.repeat(70)}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN MODE — no changes will be made ***\n');

  // Count skills to score
  const countResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM skills
    WHERE is_blocked = false
      AND is_duplicate = false
      AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
      AND quality_score IS NULL
      AND raw_content IS NOT NULL
  `);
  const total = countResult.rows[0].total;
  console.log(`  Skills to score: ${n(total)}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);

  if (total === 0) {
    console.log('  Nothing to do — all browse-ready skills already scored');
    await client.end().catch(() => {});
    return;
  }

  if (DRY_RUN) {
    const sample = await query(`
      SELECT id, LEFT(name, 50) AS name, github_stars
      FROM skills
      WHERE is_blocked = false
        AND is_duplicate = false
        AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
        AND quality_score IS NULL
        AND raw_content IS NOT NULL
      ORDER BY github_stars DESC NULLS LAST
      LIMIT 5
    `);
    console.log('\n  Sample skills that would be scored:');
    for (const r of sample.rows) {
      console.log(`    [${n(r.github_stars)}★] ${r.id} — ${r.name}`);
    }
    console.log(`\n  [DRY RUN] Would score ${n(total)} skills`);
    await client.end().catch(() => {});
    return;
  }

  // Process in batches
  let processed = 0;
  let errorCount = 0;
  let totalScore = 0;
  const scoreBuckets = { excellent: 0, good: 0, fair: 0, poor: 0 };

  while (processed < total) {
    const batch = await query(`
      SELECT id, raw_content, cached_files, source_format,
             github_stars, github_forks, license, description,
             updated_at, version, compatibility, security_score
      FROM skills
      WHERE is_blocked = false
        AND is_duplicate = false
        AND (skill_type IS NULL OR skill_type IN ('standalone', 'collection'))
        AND quality_score IS NULL
        AND raw_content IS NOT NULL
      ORDER BY github_stars DESC NULLS LAST
      LIMIT $1
    `, [BATCH_SIZE]);

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      try {
        // Parse the skill content
        const sourceFormat = row.source_format || 'skill.md';
        let skill;
        if (sourceFormat === 'skill.md') {
          skill = parseSkillMd(row.raw_content);
        } else {
          skill = parseGenericInstructionFile(row.raw_content, sourceFormat, {
            name: row.description?.split(/\s+/).slice(0, 3).join('-') || 'skill',
            description: row.description,
            owner: '',
          });
        }

        // Validate
        const validation = sourceFormat === 'skill.md'
          ? validateSkill(skill)
          : { isValid: true, errors: [], warnings: [] };

        // Construct pseudo-repoMeta from DB fields
        const repoMeta = {
          stars: row.github_stars || 0,
          forks: row.github_forks || 0,
          license: row.license || null,
          description: row.description || null,
          updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
          defaultBranch: 'main',
          topics: [], // NOT in DB — popularity factor will miss ~20 points
        };

        // Use already-computed security score (from Phase 4), default to 100 if not scanned
        const securityScore = row.security_score ?? 100;

        // Extract scripts/references from cached_files
        const scripts = extractScripts(row.cached_files);
        const references = extractReferences(row.cached_files);

        // Calculate quality
        const quality = calculateQuality(skill, repoMeta, securityScore, validation, scripts, references);

        // Build quality_details for JSONB storage
        const qualityDetails = {
          documentation: quality.documentation,
          maintenance: quality.maintenance,
          popularity: quality.popularity,
          factors: quality.factors,
        };

        await query(`
          UPDATE skills
          SET quality_score = $1,
              quality_details = $2,
              review_status = CASE
                WHEN review_status IS NULL OR review_status = 'unreviewed'
                THEN 'auto-scored'
                ELSE review_status
              END
          WHERE id = $3
        `, [quality.overall, JSON.stringify(qualityDetails), row.id]);

        totalScore += quality.overall;
        if (quality.overall >= 70) scoreBuckets.excellent++;
        else if (quality.overall >= 50) scoreBuckets.good++;
        else if (quality.overall >= 30) scoreBuckets.fair++;
        else scoreBuckets.poor++;
      } catch (err) {
        errorCount++;
        if (errorCount <= 5) {
          console.error(`\n  Error scoring ${row.id}: ${err.message}`);
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
  const scored = processed - errorCount;
  const avgScore = scored > 0 ? (totalScore / scored).toFixed(1) : 0;
  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  QUALITY SCORE SUMMARY                              │
  ├─────────────────────────────────────────────────────┤
  │  Total scored:      ${n(scored).padStart(8)}                      │
  │  Errors (skipped):  ${n(errorCount).padStart(8)}                      │
  ├─────────────────────────────────────────────────────┤
  │  Excellent (70+):   ${n(scoreBuckets.excellent).padStart(8)}                      │
  │  Good (50-69):      ${n(scoreBuckets.good).padStart(8)}                      │
  │  Fair (30-49):      ${n(scoreBuckets.fair).padStart(8)}                      │
  │  Poor (<30):        ${n(scoreBuckets.poor).padStart(8)}                      │
  ├─────────────────────────────────────────────────────┤
  │  Avg quality score: ${avgScore.toString().padStart(8)}                      │
  └─────────────────────────────────────────────────────┘
  `);

  console.log('  Note: repoMeta.topics not in DB — popularity score misses ~20 points');

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nCompleted in ${dur}s`);

  await client.end().catch(() => {});
}

main().catch(async e => {
  console.error('FAILED:', e.message || e);
  await client?.end().catch(() => {});
  process.exit(1);
});
