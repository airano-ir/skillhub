// Next.js 15 Instrumentation Hook
// This file is used to initialize Sentry on server startup
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server-side Sentry initialization
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime Sentry initialization
    await import("./sentry.edge.config");
  }
}

// Optional: Handle uncaught errors globally
export const onRequestError = async (
  error: Error,
  request: Request,
  context: { routerKind: string; routePath: string; routeType: string }
) => {
  // Dynamic import to avoid bundling Sentry in client
  const Sentry = await import("@sentry/nextjs");

  Sentry.captureException(error, {
    extra: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      url: request.url,
      method: request.method,
    },
  });
};
