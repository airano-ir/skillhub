// This file configures the initialization of Sentry for edge features (Middleware, Edge API Routes).
// The config you add here will be used whenever one of the edge features is loaded.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment and release tracking
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Enable structured logging
  enableLogs: true,

  // Performance Monitoring for edge functions
  // Capture 10% of transactions in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Edge-specific error handling
  beforeSend(event) {
    // Add edge runtime context
    event.contexts = {
      ...event.contexts,
      runtime: {
        name: "edge",
        version: "1.0",
      },
    };

    return event;
  },
});
