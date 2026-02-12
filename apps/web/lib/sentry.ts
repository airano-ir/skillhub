/**
 * Sentry Helper Functions
 * Centralized utilities for error tracking and performance monitoring
 */

import * as Sentry from "@sentry/nextjs";

// Re-export Sentry logger for structured logging
export const logger = Sentry.logger;

/**
 * Capture an exception with additional context
 */
export function captureException(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string; username?: string };
  }
) {
  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    user: context?.user,
  });
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "info",
  context?: Record<string, unknown>
) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for all future events
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
} | null) {
  Sentry.setUser(user);
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
  level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "info"
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level,
  });
}

/**
 * Start a performance span for tracking operations
 */
export async function withSpan<T>(
  name: string,
  operation: string,
  callback: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return Sentry.startSpan(
    {
      op: operation,
      name,
      attributes,
    },
    async (span) => {
      try {
        const result = await callback();
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (error) {
        span.setStatus({ code: 2, message: String(error) }); // ERROR
        throw error;
      }
    }
  );
}

/**
 * Track API route performance
 */
export async function withApiSpan<T>(
  routeName: string,
  method: string,
  callback: () => Promise<T>
): Promise<T> {
  return withSpan(`${method} ${routeName}`, "http.server", callback, {
    "http.method": method,
    "http.route": routeName,
  });
}

/**
 * Track database query performance
 */
export async function withDbSpan<T>(
  queryName: string,
  callback: () => Promise<T>
): Promise<T> {
  return withSpan(queryName, "db.query", callback);
}

/**
 * Track external API call performance
 */
export async function withExternalApiSpan<T>(
  apiName: string,
  url: string,
  callback: () => Promise<T>
): Promise<T> {
  return withSpan(`${apiName}: ${url}`, "http.client", callback, {
    "http.url": url,
  });
}

/**
 * Structured logging helpers with automatic Sentry integration
 */
export const log = {
  trace: (message: string, data?: Record<string, unknown>) => {
    logger.trace(message, data);
  },

  debug: (message: string, data?: Record<string, unknown>) => {
    logger.debug(message, data);
  },

  info: (message: string, data?: Record<string, unknown>) => {
    logger.info(message, data);
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    logger.warn(message, data);
  },

  error: (message: string, data?: Record<string, unknown>) => {
    logger.error(message, data);
  },

  fatal: (message: string, data?: Record<string, unknown>) => {
    logger.fatal(message, data);
  },
};

/**
 * API Error class for structured error handling
 */
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Handle and report API errors
 */
export function handleApiError(error: unknown, routeName: string): Response {
  if (error instanceof APIError) {
    // Expected API errors - log but don't report to Sentry
    log.warn(`API Error in ${routeName}`, {
      status: error.status,
      message: error.message,
      code: error.code,
    });

    return new Response(
      JSON.stringify({ error: error.message, code: error.code }),
      { status: error.status }
    );
  }

  // Unexpected errors - report to Sentry
  captureException(error, {
    tags: { route: routeName },
    extra: { errorType: error instanceof Error ? error.name : typeof error },
  });

  log.error(`Unexpected error in ${routeName}`, {
    error: error instanceof Error ? error.message : String(error),
  });

  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
  });
}
