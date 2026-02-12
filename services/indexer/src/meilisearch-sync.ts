import { MeiliSearch } from 'meilisearch';
import type { MeiliSkillDocument } from '@skillhub/db';

/**
 * Meilisearch sync module for the indexer
 *
 * This module syncs skills to Meilisearch after they are indexed.
 * If MEILI_URL is not configured, sync operations are no-ops.
 */

const SKILLS_INDEX = 'skills';

// Singleton client instance
let client: MeiliSearch | null = null;
let indexInitialized = false;

/**
 * Sanitize skill ID for Meilisearch
 * Meilisearch only allows alphanumeric, hyphens, and underscores in document IDs
 * We replace:
 *   / with __ (slash to double underscore)
 *   . with _dot_ (dot to _dot_)
 * Examples:
 *   "anthropics/skills/pdf" -> "anthropics__skills__pdf"
 *   "bdmorin/.claude/git" -> "bdmorin___dot_claude__git"
 *   "user/repo.name/skill" -> "user__repo_dot_name__skill"
 */
function sanitizeIdForMeili(skillId: string): string {
  return skillId
    .replace(/\//g, '__')    // slash -> double underscore
    .replace(/\./g, '_dot_'); // dot -> _dot_
}

/**
 * Check if Meilisearch is configured
 */
export function isMeilisearchConfigured(): boolean {
  return Boolean(process.env.MEILI_URL);
}

/**
 * Get or create the Meilisearch client
 */
function getMeilisearchClient(): MeiliSearch | null {
  if (!isMeilisearchConfigured()) {
    return null;
  }

  if (!client) {
    client = new MeiliSearch({
      host: process.env.MEILI_URL!,
      apiKey: process.env.MEILI_MASTER_KEY,
    });
  }

  return client;
}

/**
 * Initialize the skills index with proper settings
 * This is called once when the first skill is synced
 */
async function initializeIndex(): Promise<void> {
  if (indexInitialized) return;

  const meili = getMeilisearchClient();
  if (!meili) return;

  try {
    // Create index if not exists
    try {
      await meili.getIndex(SKILLS_INDEX);
    } catch {
      console.log('Creating Meilisearch skills index...');
      await meili.createIndex(SKILLS_INDEX, { primaryKey: 'id' });
    }

    const index = meili.index(SKILLS_INDEX);

    // Configure searchable attributes (order matters for ranking)
    await index.updateSearchableAttributes([
      'name',
      'description',
      'githubOwner',
      'githubRepo',
    ]);

    // Configure filterable attributes
    await index.updateFilterableAttributes([
      'platforms',
      'isVerified',
      'isFeatured',
      'securityScore',
      'githubStars',
    ]);

    // Configure sortable attributes
    await index.updateSortableAttributes([
      'githubStars',
      'downloadCount',
      'rating',
      'indexedAt',
    ]);

    // Configure ranking rules
    await index.updateRankingRules([
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
      'githubStars:desc',
    ]);

    indexInitialized = true;
    console.log('Meilisearch skills index initialized');
  } catch (error) {
    console.error('Failed to initialize Meilisearch index:', error);
  }
}

/**
 * Sync a single skill to Meilisearch
 */
export async function syncSkillToMeilisearch(skill: {
  id: string;
  name: string;
  description: string;
  githubOwner: string;
  githubRepo: string;
  compatibility?: { platforms?: string[] } | null;
  githubStars?: number | null;
  downloadCount?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  securityScore?: number | null;
  securityStatus?: 'pass' | 'warning' | 'fail' | null;
  isFeatured?: boolean | null;
  isVerified?: boolean | null;
  indexedAt?: Date | null;
}): Promise<boolean> {
  const meili = getMeilisearchClient();
  if (!meili) {
    // Meilisearch not configured, skip silently
    return true;
  }

  try {
    // Ensure index is initialized
    await initializeIndex();

    const doc: MeiliSkillDocument = {
      id: sanitizeIdForMeili(skill.id),
      name: skill.name,
      description: skill.description,
      githubOwner: skill.githubOwner,
      githubRepo: skill.githubRepo,
      platforms: skill.compatibility?.platforms || [],
      githubStars: skill.githubStars || 0,
      downloadCount: skill.downloadCount || 0,
      rating: skill.rating || 0,
      ratingCount: skill.ratingCount || 0,
      securityScore: skill.securityScore || 0,
      securityStatus: skill.securityStatus || null,
      isFeatured: skill.isFeatured || false,
      isVerified: skill.isVerified || false,
      indexedAt: skill.indexedAt?.toISOString() || new Date().toISOString(),
    };

    const index = meili.index<MeiliSkillDocument>(SKILLS_INDEX);
    await index.addDocuments([doc]);

    return true;
  } catch (error) {
    // Log but don't fail - Meilisearch sync is optional
    console.error('Failed to sync skill to Meilisearch:', error);
    return false;
  }
}

/**
 * Delete a skill from Meilisearch
 */
export async function deleteSkillFromMeilisearch(skillId: string): Promise<boolean> {
  const meili = getMeilisearchClient();
  if (!meili) return true;

  try {
    const index = meili.index(SKILLS_INDEX);
    await index.deleteDocument(sanitizeIdForMeili(skillId));
    return true;
  } catch (error) {
    console.error('Failed to delete skill from Meilisearch:', error);
    return false;
  }
}

/**
 * Check if Meilisearch is healthy
 */
export async function checkMeilisearchHealth(): Promise<boolean> {
  const meili = getMeilisearchClient();
  if (!meili) return false;

  try {
    await meili.health();
    return true;
  } catch {
    return false;
  }
}

/**
 * Log Meilisearch status on startup
 */
export async function logMeilisearchStatus(): Promise<void> {
  if (!isMeilisearchConfigured()) {
    console.log('Meilisearch: Not configured (MEILI_URL not set) - using PostgreSQL for search');
    return;
  }

  const healthy = await checkMeilisearchHealth();
  if (healthy) {
    console.log(`Meilisearch: Connected to ${process.env.MEILI_URL}`);
  } else {
    console.warn(`Meilisearch: Unable to connect to ${process.env.MEILI_URL} - sync will be skipped`);
  }
}

/**
 * Sync all skills from database to Meilisearch
 * This is useful for initial setup or recovering from sync issues
 */
export async function syncAllSkillsToMeilisearch(
  skills: Array<{
    id: string;
    name: string;
    description: string;
    githubOwner: string;
    githubRepo: string;
    compatibility?: { platforms?: string[] } | null;
    githubStars?: number | null;
    downloadCount?: number | null;
    rating?: number | null;
    ratingCount?: number | null;
    securityScore?: number | null;
    securityStatus?: 'pass' | 'warning' | 'fail' | null;
    isFeatured?: boolean | null;
    isVerified?: boolean | null;
    indexedAt?: Date | null;
  }>
): Promise<{ success: number; failed: number }> {
  const meili = getMeilisearchClient();
  if (!meili) {
    console.log('Meilisearch not configured, skipping bulk sync');
    return { success: 0, failed: 0 };
  }

  // Ensure index is initialized
  await initializeIndex();

  const results = { success: 0, failed: 0 };

  // Convert skills to Meilisearch documents
  const documents: MeiliSkillDocument[] = skills.map((skill) => ({
    id: sanitizeIdForMeili(skill.id),
    name: skill.name,
    description: skill.description,
    githubOwner: skill.githubOwner,
    githubRepo: skill.githubRepo,
    platforms: skill.compatibility?.platforms || [],
    githubStars: skill.githubStars || 0,
    downloadCount: skill.downloadCount || 0,
    rating: skill.rating || 0,
    ratingCount: skill.ratingCount || 0,
    securityScore: skill.securityScore || 0,
    securityStatus: skill.securityStatus || null,
    isFeatured: skill.isFeatured || false,
    isVerified: skill.isVerified || false,
    indexedAt: skill.indexedAt?.toISOString() || new Date().toISOString(),
  }));

  try {
    const index = meili.index<MeiliSkillDocument>(SKILLS_INDEX);

    // Add documents in batches of 1000 for better performance
    const BATCH_SIZE = 1000;
    const totalBatches = Math.ceil(documents.length / BATCH_SIZE);

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      await index.addDocuments(batch);
      results.success += batch.length;

      console.log(`Synced batch ${batchNum}/${totalBatches} (${results.success}/${documents.length} skills) to Meilisearch`);
    }
  } catch (error) {
    console.error('Bulk sync to Meilisearch failed:', error);
    results.failed = documents.length - results.success;
  }

  return results;
}
