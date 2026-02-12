import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createDb, sql } from '@skillhub/db';

// Simple rate limiting
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT = 5; // 5 requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, variant, locale, source } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Sanitize email
    const sanitizedEmail = email.toLowerCase().trim().slice(0, 255);

    // Validate variant
    const validVariant = variant === 'a' || variant === 'b' ? variant : 'a';

    // Store in database
    const db = createDb();

    // Create table if not exists (for first-time setup)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS early_access_signups (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        variant VARCHAR(1) NOT NULL DEFAULT 'a',
        locale VARCHAR(10),
        source VARCHAR(100),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert or update (upsert)
    await db.execute(sql`
      INSERT INTO early_access_signups (email, variant, locale, source, ip_address, user_agent)
      VALUES (
        ${sanitizedEmail},
        ${validVariant},
        ${locale || null},
        ${source || 'unknown'},
        ${ip},
        ${request.headers.get('user-agent') || null}
      )
      ON CONFLICT (email) DO UPDATE SET
        variant = EXCLUDED.variant,
        locale = EXCLUDED.locale,
        source = EXCLUDED.source
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Early access signup error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// Get signup stats (for internal use)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.ADMIN_API_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createDb();

    // Get counts by variant
    const stats = await db.execute(sql`
      SELECT
        variant,
        COUNT(*) as count,
        MAX(created_at) as last_signup
      FROM early_access_signups
      GROUP BY variant
    `) as unknown as { rows: Array<{ variant: string; count: number; last_signup: Date }> };

    const totalCount = await db.execute(sql`
      SELECT COUNT(*) as total FROM early_access_signups
    `) as unknown as { rows: Array<{ total: number }> };

    return NextResponse.json({
      total: totalCount.rows[0]?.total || 0,
      byVariant: stats.rows,
    });
  } catch (error) {
    console.error('Error fetching early access stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
