import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createDb, userQueries } from '@skillhub/db';

/**
 * Check if the current request is from an admin user.
 * Supports two auth methods:
 *   1. API key via Authorization: Bearer <REVIEW_API_KEY> header (for automation/scripts)
 *   2. Session-based admin check (for dashboard)
 *
 * Pass the request object to enable API key auth.
 * Returns the user on success, or a NextResponse error to return early.
 */
export async function requireAdmin(request?: NextRequest): Promise<
  | { authorized: true; username: string }
  | { authorized: false; response: NextResponse }
> {
  // Check API key auth first (for automation/scripting)
  if (request) {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.REVIEW_API_KEY;
    if (apiKey && authHeader === `Bearer ${apiKey}`) {
      return { authorized: true, username: 'api-key' };
    }
  }

  // Fall back to session auth
  const session = await auth();
  if (!session?.user?.githubId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const db = createDb();
  const user = await userQueries.getByGithubId(db, session.user.githubId);
  if (!user?.isAdmin) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }

  return { authorized: true, username: user.username };
}
