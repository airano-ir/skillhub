// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment and release tracking
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Enable structured logging
  enableLogs: true,

  // Console logging integration - capture warnings and errors from server
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ["warn", "error"],
    }),
  ],

  // Performance Monitoring
  // Capture 10% of transactions in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Filter and enhance error events
  beforeSend(event, hint) {
    const error = hint.originalException;

    // Add database query info if available
    if (error && typeof error === "object" && "query" in error) {
      event.extra = {
        ...event.extra,
        query: (error as { query?: string }).query,
      };
    }

    return event;
  },

  // Ignore specific server errors that are expected
  ignoreErrors: [
    // Next.js internal errors
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    // Network errors that are normal
    "ECONNRESET",
    "ETIMEDOUT",
  ],
});
