import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries } from '@skillhub/db';
import { shouldCountView, getOrSetCache, cacheKeys, cacheTTL } from '@/lib/cache';

// Create database connection
const db = createDb();

/**
 * Get client IP from request headers
 * Handles various proxy headers (Cloudflare, nginx, etc.)
 */
function getClientIp(request: NextRequest): string {
  // Try various headers in order of preference
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return xForwardedFor.split(',')[0].trim();
  }

  // Fallback to a default (shouldn't happen in production)
  return 'unknown';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const skillId = id.join('/');

    // Get skill from database (cached 1h)
    const skill = await getOrSetCache(
      cacheKeys.skill(skillId),
      cacheTTL.skill,
      () => skillQueries.getById(db, skillId)
    );

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // Increment view count only on primary server (mirror DB is read-only)
    const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
    if (isPrimary) {
      const clientIp = getClientIp(request);
      const shouldCount = await shouldCountView(skillId, clientIp);

      if (shouldCount) {
        await skillQueries.incrementViews(db, skillId);
      }
    }

    return NextResponse.json({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      githubOwner: skill.githubOwner,
      githubRepo: skill.githubRepo,
      skillPath: skill.skillPath,
      branch: skill.branch,
      version: skill.version,
      license: skill.license,
      author: skill.author,
      homepage: skill.homepage,
      githubStars: skill.githubStars,
      githubForks: skill.githubForks,
      downloadCount: skill.downloadCount,
      viewCount: skill.viewCount,
      securityScore: skill.securityScore,
      isVerified: skill.isVerified,
      isFeatured: skill.isFeatured,
      compatibility: skill.compatibility,
      triggers: skill.triggers,
      rawContent: skill.rawContent,
      sourceFormat: skill.sourceFormat || 'skill.md',
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      indexedAt: skill.indexedAt,
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill' },
      { status: 500 }
    );
  }
}
