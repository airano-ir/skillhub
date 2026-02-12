import { MeiliSearch } from 'meilisearch';
import type { Index, SearchResponse } from 'meilisearch';

/**
 * Meilisearch client module for SkillHub
 *
 * This module is OPTIONAL - if MEILI_URL is not set, search falls back to PostgreSQL.
 * This allows developers to run the project without Meilisearch for simpler setup.
 */

const SKILLS_INDEX = 'skills';

/**
 * Meilisearch document type for skills
 */
export interface MeiliSkillDocument {
  id: string;
  name: string;
  description: string;
  githubOwner: string;
  githubRepo: string;
  platforms: string[];
  githubStars: number;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  securityScore: number;
  securityStatus: 'pass' | 'warning' | 'fail' | null;
  isFeatured: boolean;
  isVerified: boolean;
  indexedAt: string;
}

/**
 * Search options for Meilisearch
 */
export interface MeiliSearchOptions {
  query: string;
  filters?: {
    platforms?: string[];
    minStars?: number;
    minSecurity?: number;
    verified?: boolean;
    featured?: boolean;
  };
  sort?: 'stars' | 'downloads' | 'rating' | 'recent';
  limit?: number;
  offset?: number;
}

/**
 * Search result type
 */
export interface MeiliSearchResult {
  hits: MeiliSkillDocument[];
  estimatedTotalHits: number;
  processingTimeMs: number;
}

// Singleton client instance
let client: MeiliSearch | null = null;

/**
 * Check if Meilisearch is configured
 */
export function isMeilisearchConfigured(): boolean {
  return Boolean(process.env.MEILI_URL);
}

/**
 * Get or create the Meilisearch client
 * Returns null if MEILI_URL is not configured
 */
export function getMeilisearchClient(): MeiliSearch | null {
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
 * Check if Meilisearch is healthy and accessible
 */
export async function isMeilisearchHealthy(): Promise<boolean> {
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
 * Get or create the skills index with proper settings
 */
export async function getSkillsIndex(): Promise<Index<MeiliSkillDocument> | null> {
  const meili = getMeilisearchClient();
  if (!meili) return null;

  try {
    const index = meili.index<MeiliSkillDocument>(SKILLS_INDEX);

    // Check if index exists by trying to get its settings
    try {
      await index.getSettings();
    } catch {
      // Index doesn't exist, create it with settings
      await initializeSkillsIndex();
    }

    return index;
  } catch (error) {
    console.error('Failed to get skills index:', error);
    return null;
  }
}

/**
 * Initialize the skills index with proper settings
 */
export async function initializeSkillsIndex(): Promise<void> {
  const meili = getMeilisearchClient();
  if (!meili) return;

  try {
    // Create index if not exists
    await meili.createIndex(SKILLS_INDEX, { primaryKey: 'id' });

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

    // Configure ranking rules (relevance + custom)
    await index.updateRankingRules([
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
      'githubStars:desc', // Boost popular skills
    ]);

    console.log('Meilisearch skills index initialized');
  } catch (error) {
    console.error('Failed to initialize skills index:', error);
  }
}

/**
 * Add or update a skill document in Meilisearch
 */
export async function addSkillDocument(skill: MeiliSkillDocument): Promise<boolean> {
  const index = await getSkillsIndex();
  if (!index) return false;

  try {
    await index.addDocuments([skill]);
    return true;
  } catch (error) {
    console.error('Failed to add skill to Meilisearch:', error);
    return false;
  }
}

/**
 * Add or update multiple skill documents in Meilisearch
 */
export async function addSkillDocuments(skills: MeiliSkillDocument[]): Promise<boolean> {
  if (skills.length === 0) return true;

  const index = await getSkillsIndex();
  if (!index) return false;

  try {
    await index.addDocuments(skills);
    return true;
  } catch (error) {
    console.error('Failed to add skills to Meilisearch:', error);
    return false;
  }
}

/**
 * Delete a skill document from Meilisearch
 */
export async function deleteSkillDocument(skillId: string): Promise<boolean> {
  const index = await getSkillsIndex();
  if (!index) return false;

  try {
    await index.deleteDocument(skillId);
    return true;
  } catch (error) {
    console.error('Failed to delete skill from Meilisearch:', error);
    return false;
  }
}

/**
 * Search skills using Meilisearch
 */
export async function searchSkills(options: MeiliSearchOptions): Promise<MeiliSearchResult | null> {
  const index = await getSkillsIndex();
  if (!index) return null;

  try {
    // Build filter string
    const filterParts: string[] = [];

    if (options.filters?.platforms?.length) {
      // Filter by any of the platforms
      const platformFilters = options.filters.platforms.map(p => `platforms = "${p}"`);
      filterParts.push(`(${platformFilters.join(' OR ')})`);
    }

    if (options.filters?.verified) {
      filterParts.push('isVerified = true');
    }

    if (options.filters?.featured) {
      filterParts.push('isFeatured = true');
    }

    if (options.filters?.minStars) {
      filterParts.push(`githubStars >= ${options.filters.minStars}`);
    }

    if (options.filters?.minSecurity) {
      filterParts.push(`securityScore >= ${options.filters.minSecurity}`);
    }

    // Build sort array
    const sort: string[] = [];
    switch (options.sort) {
      case 'stars':
        sort.push('githubStars:desc');
        break;
      case 'downloads':
        sort.push('downloadCount:desc');
        break;
      case 'rating':
        sort.push('rating:desc');
        break;
      case 'recent':
        sort.push('indexedAt:desc');
        break;
    }

    const searchResult: SearchResponse<MeiliSkillDocument> = await index.search(options.query, {
      filter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
      sort: sort.length > 0 ? sort : undefined,
      limit: options.limit || 20,
      offset: options.offset || 0,
    });

    return {
      hits: searchResult.hits,
      estimatedTotalHits: searchResult.estimatedTotalHits || searchResult.hits.length,
      processingTimeMs: searchResult.processingTimeMs,
    };
  } catch (error) {
    console.error('Meilisearch search failed:', error);
    return null;
  }
}

/**
 * Get all documents from the skills index (for debugging/admin)
 */
export async function getAllSkillDocuments(limit = 1000): Promise<MeiliSkillDocument[]> {
  const index = await getSkillsIndex();
  if (!index) return [];

  try {
    const result = await index.getDocuments({ limit });
    return result.results;
  } catch (error) {
    console.error('Failed to get all skill documents:', error);
    return [];
  }
}

/**
 * Clear all documents from the skills index
 */
export async function clearSkillsIndex(): Promise<boolean> {
  const index = await getSkillsIndex();
  if (!index) return false;

  try {
    await index.deleteAllDocuments();
    return true;
  } catch (error) {
    console.error('Failed to clear skills index:', error);
    return false;
  }
}
