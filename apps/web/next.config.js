import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Content Security Policy configuration
let ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://*.githubusercontent.com;
  font-src 'self' https://cdn.jsdelivr.net;
  connect-src 'self' https://api.github.com https://*.meilisearch.com https://*.sentry.io https://*.ingest.sentry.io;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();


// Security headers configuration
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy,
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Enable experimental features
  experimental: {
    // Enable server actions
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
    ],
  },

  // Transpile workspace packages
  transpilePackages: ['@skillhub/core', '@skillhub/db', '@skillhub/ui'],

  // Security headers
  async headers() {
    const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';

    // Base headers for all routes
    const baseHeaders = [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ];

    // Mirror server: Add X-Robots-Tag to block indexing
    if (!isPrimary) {
      baseHeaders.push({
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      });
    }

    return baseHeaders;
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload source maps to Sentry for better error tracking
  // Requires SENTRY_AUTH_TOKEN and SENTRY_ORG/SENTRY_PROJECT env vars
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,

  // Automatically annotate React components with their name
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: process.env.NODE_ENV === "production",

  // Enables automatic instrumentation of Vercel Cron Monitors
  automaticVercelMonitors: false,
};

// Wrap with both next-intl and Sentry
export default withSentryConfig(withNextIntl(nextConfig), sentryWebpackPluginOptions);
