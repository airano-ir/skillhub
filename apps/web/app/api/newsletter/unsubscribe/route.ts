import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createDb } from '@skillhub/db';
import { emailSubscriptionQueries } from '@skillhub/db';
import { withRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

const PRIMARY_URL = process.env.PRIMARY_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (reuse 'search' tier: 60/min)
    const rateLimitResult = await withRateLimit(request, 'search');
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult, 'search');
    }

    // POST is already blocked by middleware on mirror servers (503)
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const db = createDb();
    await emailSubscriptionQueries.unsubscribe(db, email);

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      unsubscribed: true,
    });
  } catch (error) {
    console.error('[Newsletter] Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET handler for one-click unsubscribe links in emails
 * Redirects to homepage after unsubscribing
 * On mirror servers, redirects to primary server for the unsubscribe action
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.redirect(new URL('/', PRIMARY_URL));
    }

    // On mirror server, redirect to primary for write operation
    const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
    if (!isPrimary) {
      return NextResponse.redirect(
        `${PRIMARY_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`
      );
    }

    const db = createDb();
    await emailSubscriptionQueries.unsubscribe(db, email);

    // Redirect to homepage with unsubscribe confirmation
    const redirectUrl = new URL('/', PRIMARY_URL);
    redirectUrl.searchParams.set('unsubscribed', 'true');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Newsletter] Unsubscribe GET error:', error);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
