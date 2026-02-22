// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment and release tracking
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Enable structured logging
  enableLogs: true,

  // Console logging integration - capture warnings and errors
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ["warn", "error"],
    }),
  ],

  // Performance Monitoring
  // Capture 10% of transactions in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay for debugging user issues
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

  // Filter out common non-actionable errors
  ignoreErrors: [
    // AbortError during navigation — Next.js RSC prefetch/streaming cancelled mid-flight
    "AbortError",
    // Network stream errors (Firefox)
    "Error in input stream",
    // Network fetch failures (Safari / mobile)
    "Load failed",
    // Generic network errors (client connectivity issues)
    "network error",
    // Browser extension noise (translation/accessibility extensions)
    /Object Not Found Matching Id/,
    // ResizeObserver loop limit — browser quirk, not actionable
    "ResizeObserver",
  ],

  beforeSend(event, hint) {
    // Log to console in development for debugging
    if (process.env.NODE_ENV === "development") {
      console.error("[Sentry]", hint.originalException || hint.syntheticException);
    }

    return event;
  },

  // Filter out noisy breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    // Ignore fetch requests to analytics endpoints
    if (
      breadcrumb.category === "fetch" &&
      breadcrumb.data?.url?.includes("analytics")
    ) {
      return null;
    }
    return breadcrumb;
  },
});
