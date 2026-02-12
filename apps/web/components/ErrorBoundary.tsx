"use client";

import { Component, useState, useCallback } from "react";
import type { ReactNode, ErrorInfo } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

/**
 * React Error Boundary with Sentry integration
 * Catches rendering errors in child components and reports them to Sentry
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to Sentry with React component stack
    const eventId = Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

    this.setState({ eventId });

    // Also log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  handleReportFeedback = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({ eventId: this.state.eventId });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-bg">
              <AlertTriangle className="h-8 w-8 text-error" />
            </div>

            <h2 className="mb-2 text-xl font-semibold text-text-primary">
              Something went wrong
            </h2>

            <p className="mb-6 text-text-secondary">
              We&apos;ve been notified and are working on a fix. Please try
              again or contact support if the problem persists.
            </p>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mb-6 rounded-lg bg-error-bg p-4 text-left">
                <p className="font-mono text-sm text-error">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>

              {this.state.eventId && (
                <button
                  onClick={this.handleReportFeedback}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-subtle transition-colors"
                >
                  Report feedback
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to throw errors from async code so they can be caught by ErrorBoundary
 * Usage:
 *   const throwError = useAsyncError();
 *   fetchData().catch(throwError);
 */
export function useAsyncError() {
  const [, setError] = useState<Error | null>(null);

  return useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}

export default ErrorBoundary;
