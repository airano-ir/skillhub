import { type NextRequest, NextResponse } from 'next/server';
import { createDb, skillQueries, sql } from '@skillhub/db';
import { requireAdmin } from '@/lib/admin-auth';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

/**
 * GET /api/review/diagnose?id=owner/repo/skill-name
 * Returns which review pipeline filters a skill passes/fails.
 * Calls the actual PostgreSQL raw_content_passes_prefilter function to detect
 * discrepancies between JS approximation and SQL reality (e.g. invalid UTF-8).
 * Admin-only endpoint for debugging why skills don't appear in pending list.
 */
export async function GET(request: NextRequest) {
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return adminCheck.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('id');

    if (!skillId) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const skill = await skillQueries.getById(db, skillId);

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found', id: skillId }, { status: 404 });
    }

    // Call the ACTUAL PostgreSQL function to check prefilter
    // This catches UTF-8 issues that the JS approximation misses
    let sqlPrefilterPass = false;
    try {
      const result = await db.execute(
        sql`SELECT raw_content_passes_prefilter(raw_content) AS passes FROM skills WHERE id = ${skillId}`
      );
      const row = [...result][0] as { passes?: boolean } | undefined;
      sqlPrefilterPass = row?.passes === true;
    } catch {
      sqlPrefilterPass = false;
    }

    // JS approximation for comparison
    const rawContent = skill.rawContent ?? '';
    const contentLength = Buffer.byteLength(rawContent, 'utf8');
    const hasGeneratedComment = rawContent.includes('<!-- generated');
    const hasUserPath = rawContent.substring(0, 1000).includes('/Users/') ||
                        rawContent.substring(0, 1000).includes('C:\\Users\\');
    const jsPrefilterPass = contentLength >= 200 && !hasGeneratedComment && !hasUserPath;

    const filters = {
      // browseReadyFilter conditions
      isDuplicate: { value: skill.isDuplicate, pass: !skill.isDuplicate || skill.isOwnerClaimed },
      isStale: { value: skill.isStale, pass: !skill.isStale },
      isMalicious: { value: skill.isMalicious, pass: !skill.isMalicious },

      // Other conditions
      isBlocked: { value: skill.isBlocked, pass: !skill.isBlocked },
      sourceFormat: { value: skill.sourceFormat, pass: skill.sourceFormat === 'skill.md' },
      isDeprecated: { value: skill.isDeprecated, pass: !skill.isDeprecated },
      securityStatus: { value: skill.securityStatus, pass: skill.securityStatus === 'pass' },
      qualityScore: { value: skill.qualityScore, pass: (skill.qualityScore ?? 0) >= 50 },
      reviewStatus: { value: skill.reviewStatus, pass: skill.reviewStatus === 'auto-scored' },

      // Prefilter: actual PostgreSQL function result
      sqlPrefilter: { value: sqlPrefilterPass, pass: sqlPrefilterPass },
      // JS approximation breakdown (for debugging discrepancies)
      jsPrefilter: { value: jsPrefilterPass, pass: jsPrefilterPass },
      contentLength: { value: contentLength, pass: contentLength >= 200 },
      hasGeneratedComment: { value: hasGeneratedComment, pass: !hasGeneratedComment },
      hasUserPath: { value: hasUserPath, pass: !hasUserPath },
    };

    // Use sqlPrefilter as the real filter (not JS approximation)
    const failedFilters = Object.entries(filters)
      .filter(([key, f]) => !f.pass && key !== 'jsPrefilter' && key !== 'contentLength' && key !== 'hasGeneratedComment' && key !== 'hasUserPath')
      .map(([name]) => name);

    return NextResponse.json(
      {
        id: skill.id,
        name: skill.name,
        downloadCount: skill.downloadCount,
        wouldAppearInPending: failedFilters.length === 0,
        failedFilters,
        filters,
        // Flag discrepancy between JS and SQL prefilter
        ...(jsPrefilterPass !== sqlPrefilterPass ? { prefilterDiscrepancy: true } : {}),
      },
      { headers: createRateLimitHeaders(rateLimitResult) }
    );
  } catch (error) {
    console.error('[Review] Diagnose error:', error);
    return NextResponse.json({ error: 'Failed to diagnose skill' }, { status: 500 });
  }
}
