/**
 * Skill indexing utility
 * Shared between worker and CLI commands
 */

import type { SourceFormat } from 'skillhub-core';
import { createDb, skillQueries, categoryQueries, addRequestQueries, userQueries, type Database } from '@skillhub/db';
import { sendSkillIndexedEmail } from './email-notify.js';
import type { GitHubCrawler } from './crawler.js';
import { SkillAnalyzer } from './analyzer.js';
import { syncSkillToMeilisearch } from './meilisearch-sync.js';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = createDb(process.env.DATABASE_URL);
  }
  return db;
}

/**
 * Index a single skill from a GitHub source
 */
export async function indexSkill(
  crawler: GitHubCrawler,
  source: { owner: string; repo: string; path: string; branch: string; sourceFormat?: SourceFormat },
  force = false
): Promise<string | null> {
  const database = getDb();
  const analyzer = new SkillAnalyzer();
  const sourceFormat = source.sourceFormat || 'skill.md';

  // Fetch skill content
  console.log(`Fetching ${source.owner}/${source.repo}/${source.path} [${sourceFormat}]...`);
  const content = await crawler.fetchSkillContent(source);

  // Analyze the skill with format awareness
  const analysis = await analyzer.analyze(content, sourceFormat);

  // Skip invalid skills
  if (!analysis.validation.isValid) {
    console.log(`Skipping invalid skill: ${analysis.validation.errors.map((e) => e.message).join(', ')}`);
    return null;
  }

  // Generate skill ID with format suffix for non-SKILL.md
  const skillName = analysis.skill.metadata.name || source.path.split('/').pop() || 'skill';
  const formatSuffix = sourceFormat !== 'skill.md' ? `~${sourceFormat.replace('.', '')}` : '';
  const skillId = `${source.owner}/${source.repo}/${skillName}${formatSuffix}`;

  // Check if skill is blocked (owner requested removal)
  const existing = await skillQueries.getById(database, skillId);
  if (existing?.isBlocked) {
    console.log(`Skill ${skillId} is blocked, skipping`);
    return null;
  }

  // Check if we need to update (unless force)
  if (!force) {
    if (existing && existing.contentHash === analysis.meta.contentHash) {
      // Content unchanged, but check if path/branch changed
      // (e.g., repo was restructured, file moved to a different directory)
      const actualBranch = source.branch || content.repoMeta.defaultBranch;
      if (existing.skillPath !== source.path || existing.branch !== actualBranch) {
        console.log(`Skill ${skillId} path changed: ${existing.skillPath} → ${source.path}`);
        // Don't skip - fall through to upsert which now updates skillPath/branch
      } else {
        console.log(`Skill ${skillId} unchanged, skipping`);
        return null;
      }
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
    repoCreatedAt: new Date(content.repoMeta.createdAt),
    securityScore: analysis.security.score,
    securityStatus: analysis.security.status,
    qualityScore: analysis.quality.overall,
    qualityDetails: {
      documentation: analysis.quality.documentation,
      maintenance: analysis.quality.maintenance,
      popularity: analysis.quality.popularity,
      factors: analysis.quality.factors,
    },
    contentHash: analysis.meta.contentHash,
    rawContent: content.skillMd,
    indexedAt: new Date(),
  });

  // Sync to Meilisearch (optional - continues even if fails)
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

  // Check for matching add-requests and mark as indexed
  try {
    const matchingRequests = await addRequestQueries.findApprovedByRepo(
      database,
      source.owner,
      source.repo
    );

    for (const request of matchingRequests) {
      await addRequestQueries.updateStatus(database, request.id, {
        status: 'indexed',
        indexedSkillId: skillId,
      });

      // Send email notification
      const user = await userQueries.getById(database, request.userId);
      if (user?.email) {
        const locale = (user.preferredLocale === 'fa' ? 'fa' : 'en') as 'en' | 'fa';
        await sendSkillIndexedEmail(
          user.email,
          locale,
          {
            skillId,
            skillName: analysis.skill.metadata.name,
            repositoryUrl: `https://github.com/${source.owner}/${source.repo}`,
          }
        ).catch((err: unknown) => {
          console.warn(`[Indexer] Failed to send indexed email for ${skillId}:`, err);
        });
      }
    }
  } catch (error) {
    console.warn(`[Indexer] Failed to check add-requests for ${skillId}:`, error);
  }

  // Link skill to categories based on keywords
  try {
    const categories = await categoryQueries.linkSkillToCategories(
      database,
      skillId,
      analysis.skill.metadata.name,
      analysis.skill.metadata.description || ''
    );
    console.log(`  -> Categories: [${categories.join(', ')}]`);
  } catch (error) {
    console.warn(`  -> Failed to link categories:`, error);
  }

  console.log(`Indexed: ${skillId} [${sourceFormat}] (security: ${analysis.security.score}, quality: ${analysis.quality.overall})`);

  return skillId;
}
