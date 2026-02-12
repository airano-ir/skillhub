/**
 * Direct crawl script - bypasses the queue and runs crawl directly
 * Usage: npx tsup src/direct-crawl.ts --format cjs --outDir dist && node dist/direct-crawl.js
 */

import pLimit from 'p-limit';
import type { SkillSource, SourceFormat } from 'skillhub-core';
import { createDb, skillQueries, categoryQueries, type Database } from '@skillhub/db';
import { GitHubCrawler } from './crawler.js';
import { SkillAnalyzer } from './analyzer.js';
import { syncSkillToMeilisearch, logMeilisearchStatus } from './meilisearch-sync.js';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = createDb(process.env.DATABASE_URL);
  }
  return db;
}

/**
 * Index a single skill (copied from worker.ts pattern)
 */
async function indexSkill(
  crawler: GitHubCrawler,
  source: SkillSource,
  force = false
): Promise<string | null> {
  const database = getDb();
  const analyzer = new SkillAnalyzer();

  const sourceFormat: SourceFormat = source.sourceFormat || 'skill.md';

  try {
    // Fetch skill content
    const content = await crawler.fetchSkillContent(source);

    // Analyze the skill with format awareness
    const analysis = await analyzer.analyze(content, sourceFormat);

    // Skip invalid skills
    if (!analysis.validation.isValid) {
      console.log(`  ⚠️ Invalid: ${analysis.validation.errors.map((e) => e.message).join(', ')}`);
      return null;
    }

    // Generate skill ID with format suffix for non-SKILL.md
    const skillName = analysis.skill.metadata.name || source.path.split('/').pop() || 'skill';
    const formatSuffix = sourceFormat !== 'skill.md' ? `~${sourceFormat.replace('.', '')}` : '';
    const skillId = `${source.owner}/${source.repo}/${skillName}${formatSuffix}`;

    // Check if skill is blocked (owner requested removal)
    const existing = await skillQueries.getById(database, skillId);
    if (existing?.isBlocked) {
      console.log(`  🚫 Blocked (owner requested removal)`);
      return null;
    }

    // Check if we need to update (unless force)
    if (!force) {
      if (existing && existing.contentHash === analysis.meta.contentHash) {
        return null; // Unchanged, skip
      }
    }

    // Upsert to database
    await skillQueries.upsert(database, {
      id: skillId,
      name: analysis.skill.metadata.name,
      description: analysis.skill.metadata.description,
      githubOwner: source.owner,
      githubRepo: source.repo,
      skillPath: source.path,
      branch: source.branch || content.repoMeta.defaultBranch,
      sourceFormat,
      version: analysis.skill.metadata.version,
      license: analysis.skill.metadata.license || content.repoMeta.license,
      author: analysis.skill.metadata.author,
      homepage: analysis.skill.metadata.homepage,
      compatibility: analysis.skill.metadata.compatibility,
      triggers: analysis.skill.metadata.triggers,
      githubStars: content.repoMeta.stars,
      githubForks: content.repoMeta.forks,
      securityScore: analysis.security.score,
      contentHash: analysis.meta.contentHash,
      rawContent: content.skillMd,
      indexedAt: new Date(),
    });

    // Sync to Meilisearch
    await syncSkillToMeilisearch({
      id: skillId,
      name: analysis.skill.metadata.name,
      description: analysis.skill.metadata.description,
      githubOwner: source.owner,
      githubRepo: source.repo,
      compatibility: analysis.skill.metadata.compatibility,
      githubStars: content.repoMeta.stars,
      securityScore: analysis.security.score,
      indexedAt: new Date(),
    });

    // Link to categories
    try {
      await categoryQueries.linkSkillToCategories(
        database,
        skillId,
        analysis.skill.metadata.name,
        analysis.skill.metadata.description || ''
      );
    } catch {
      // Category linking is optional
    }

    console.log(`  ✅ ${skillId} [${sourceFormat}] (⭐${content.repoMeta.stars})`);
    return skillId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Only log non-network errors
    if (!message.includes('socket') && !message.includes('network')) {
      console.error(`  ❌ ${source.owner}/${source.repo}/${source.path} - ${message}`);
    }
    throw error;
  }
}

/**
 * Run the full crawl directly
 */
async function runDirectCrawl() {
  console.log('🚀 Starting direct crawl (no queue)...\n');

  const startTime = Date.now();
  const crawler = new GitHubCrawler();

  // Check Meilisearch
  await logMeilisearchStatus();

  // Discover all skill repositories
  console.log('\n📡 Discovering skill repositories...');
  const sources = await crawler.discoverSkillRepos({
    minStars: 0,
    maxPages: 50,
  });

  console.log(`\n📊 Discovered ${sources.length} potential skills\n`);

  // Index each skill with rate limiting
  const limit = pLimit(3);
  const results = { indexed: 0, failed: 0, skipped: 0 };

  console.log('⏳ Indexing skills...\n');

  const indexPromises = sources.map((source) =>
    limit(async () => {
      try {
        const skillId = await indexSkill(crawler, source, false);
        if (skillId) {
          results.indexed++;
        } else {
          results.skipped++;
        }
      } catch {
        results.failed++;
      }
    })
  );

  await Promise.all(indexPromises);

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n' + '='.repeat(50));
  console.log('📊 Crawl Complete!');
  console.log('='.repeat(50));
  console.log(`  ✅ Indexed: ${results.indexed}`);
  console.log(`  ⏭️ Skipped: ${results.skipped}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  console.log(`  ⏱️ Duration: ${duration}s`);
  console.log('='.repeat(50));

  process.exit(0);
}

// Run
runDirectCrawl().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
