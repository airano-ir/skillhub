import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createDb } from '@skillhub/db';
import { emailSubscriptionQueries } from '@skillhub/db';
import { withRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { sendNewsletterWelcomeEmail } from '@/lib/email';

const PRIMARY_URL = process.env.PRIMARY_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * GET handler for one-click newsletter subscription from email links
 * Subscribes and redirects to homepage with confirmation
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');
    const locale = request.nextUrl.searchParams.get('locale') || 'en';

    if (!email) {
      return NextResponse.redirect(new URL('/', PRIMARY_URL));
    }

    const sanitizedEmail = email.toLowerCase().trim().slice(0, 255);
    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      return NextResponse.redirect(new URL('/', PRIMARY_URL));
    }

    const db = createDb();
    await emailSubscriptionQueries.subscribe(db, {
      email: sanitizedEmail,
      source: 'newsletter',
      marketingConsent: true,
    });

    const validLocales = ['en', 'fa'];
    const sanitizedLocale = validLocales.includes(locale) ? locale : 'en';

    sendNewsletterWelcomeEmail(sanitizedEmail, sanitizedLocale as 'en' | 'fa').catch((err) => {
      console.error('[Newsletter] Failed to send newsletter welcome email:', err);
    });

    const redirectUrl = new URL('/', PRIMARY_URL);
    redirectUrl.searchParams.set('subscribed', 'true');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Newsletter] Subscribe GET error:', error);
    return NextResponse.redirect(new URL('/', PRIMARY_URL));
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (reuse 'search' tier: 60/min)
    const rateLimitResult = await withRateLimit(request, 'search');
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult, 'search');
    }

    const body = await request.json();
    const { email, source, marketingConsent, locale } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const sanitizedEmail = email.toLowerCase().trim().slice(0, 255);

    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Validate source
    const validSources = ['newsletter', 'oauth', 'claim', 'early-access'];
    const sanitizedSource = validSources.includes(source) ? source : 'newsletter';

    // Store in database
    const db = createDb();
    await emailSubscriptionQueries.subscribe(db, {
      email: sanitizedEmail,
      source: sanitizedSource,
      marketingConsent: Boolean(marketingConsent),
    });

    // Validate locale
    const validLocales = ['en', 'fa'];
    const sanitizedLocale = validLocales.includes(locale) ? locale : 'en';

    // Send newsletter welcome email (non-blocking, don't fail if email sending fails)
    sendNewsletterWelcomeEmail(sanitizedEmail, sanitizedLocale).catch((err) => {
      console.error('[Newsletter] Failed to send newsletter welcome email:', err);
    });

    return NextResponse.json({
      success: true,
      subscribed: true,
    });
  } catch (error) {
    console.error('[Newsletter] Subscribe error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
