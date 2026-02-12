import { type NextRequest, NextResponse } from 'next/server';
import { createDb, categoryQueries } from '@skillhub/db';
import { getCached, setCache, cacheKeys, cacheTTL } from '@/lib/cache';
import { withRateLimit, createRateLimitResponse, createRateLimitHeaders } from '@/lib/rate-limit';

const db = createDb();

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  skillCount: number;
  sortOrder: number;
}

interface CategoriesResponse {
  categories: CategoryData[];
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await withRateLimit(request, 'anonymous');
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    // Try to get from cache first
    const cacheKey = cacheKeys.categories();
    const cached = await getCached<CategoriesResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'X-Cache': 'HIT', ...createRateLimitHeaders(rateLimitResult) },
      });
    }

    // Get only leaf categories (filter out parent categories)
    const categories = await categoryQueries.getLeafCategories(db);

    const data: CategoriesResponse = {
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        skillCount: cat.skillCount ?? 0,
        sortOrder: cat.sortOrder ?? 0,
      })),
    };

    // Cache the result (12 hours - categories rarely change)
    await setCache(cacheKey, data, cacheTTL.categories);

    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', ...createRateLimitHeaders(rateLimitResult) },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
