import { NextResponse, type NextRequest } from 'next/server';
import { createDb, skillQueries } from '@skillhub/db';
import { invalidateCache, cacheKeys, shouldCountDownload } from '@/lib/cache';

// Create database connection
const db = createDb();

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  return 'unknown';
}

/**
 * POST /api/skills/install
 * Track a skill installation from CLI or other sources
 *
 * Body: { skillId: string, platform?: string, method?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: { skillId?: string; platform?: string; method?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { skillId, platform = 'unknown', method = 'unknown' } = body;

    if (!skillId) {
      return NextResponse.json(
        { error: 'skillId is required' },
        { status: 400 }
      );
    }

    // Verify skill exists
    const skill = await skillQueries.getById(db, skillId);
    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // Rate limit: same IP can only count 1 download per skill per 5 minutes
    const clientIp = getClientIp(request);
    const shouldCount = await shouldCountDownload(skillId, clientIp);

    // Only increment if this is a new download from this IP
    if (shouldCount) {
      await skillQueries.incrementDownloads(db, skillId);
    }

    // Invalidate relevant caches so featured/recent lists reflect the new download
    await Promise.all([
      invalidateCache(cacheKeys.featuredSkills()),
      invalidateCache(cacheKeys.recentSkills()),
      invalidateCache(cacheKeys.stats()),
      invalidateCache(cacheKeys.skill(skillId)),
    ]);

    return NextResponse.json({
      success: true,
      skillId,
      platform,
      method,
    });
  } catch (error) {
    console.error('Error tracking install:', error);
    return NextResponse.json(
      { error: 'Failed to track install' },
      { status: 500 }
    );
  }
}
