import { locales } from '@/i18n';

export const primaryDomain =
    process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

const DEFAULT_LOCALE = 'en';

/** 
 * Get canonical URL path for a locale 
 * (no prefix for default locale, matching localePrefix: 'as-needed')
 */
export function getCanonicalPath(locale: string, route: string): string {
    // Normalize route to always start with a slash and not end with a slash
    let formattedRoute = route;
    if (!formattedRoute.startsWith('/')) {
        formattedRoute = `/${formattedRoute}`;
    }
    if (formattedRoute.length > 1 && formattedRoute.endsWith('/')) {
        formattedRoute = formattedRoute.slice(0, -1);
    }

    if (locale === DEFAULT_LOCALE) {
        if (formattedRoute === '/') return '';
        return formattedRoute;
    }

    if (formattedRoute === '/') return `/${locale}`;
    return `/${locale}${formattedRoute}`;
}

/**
 * Generate Next.js alternates metadata for a specific route
 * @param locale Current active locale
 * @param route The route path (e.g. '/about', '/categories')
 */
export function getPageAlternates(locale: string, route: string) {
    // Ensure we fall back to / if it's empty
    const canonicalPath = getCanonicalPath(locale, route) || '/';

    const languages: Record<string, string> = {};

    for (const l of locales) {
        languages[l] = `${primaryDomain}${getCanonicalPath(l, route) || '/'}`;
    }

    return {
        canonical: `${primaryDomain}${canonicalPath}`,
        languages,
    };
}
