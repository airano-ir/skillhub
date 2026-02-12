/**
 * Input sanitization utilities for user-submitted content
 * Server-side compatible - no DOM dependencies
 */

/**
 * Strip all HTML tags from input
 * Uses regex to remove all HTML elements
 *
 * @param input - Raw user input that may contain HTML
 * @returns Plain text with all HTML tags removed
 */
export function stripHtml(input: string): string {
  // Remove HTML tags
  const result = input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and their content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove all other HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return result;
}

/**
 * Sanitize text input with basic cleaning
 * - Trims whitespace
 * - Removes null bytes
 * - Normalizes whitespace (multiple spaces to single)
 * - Removes control characters except newlines and tabs
 *
 * @param input - Raw user input
 * @returns Cleaned text string
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines (\n), carriage returns (\r), and tabs (\t)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize multiple whitespace to single space (preserve newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Trim leading/trailing whitespace
    .trim();
}

/**
 * Sanitize HTML input by stripping all HTML tags
 * Returns plain text only - no HTML allowed
 *
 * @param input - Raw user input that may contain HTML
 * @returns Sanitized string with all HTML tags removed
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  const stripped = stripHtml(input);
  return sanitizeText(stripped);
}

/**
 * Sanitize user-submitted review/comment text
 * Combines HTML stripping and text cleaning
 *
 * @param input - Raw review text from user
 * @returns Sanitized review text safe for storage and display
 */
export function sanitizeReview(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const cleaned = sanitizeHtml(input);

  // Return null if empty after sanitization
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Sanitize a reason field (for removal/add requests)
 * Similar to review but always returns a string (required field)
 *
 * @param input - Raw reason text from user
 * @returns Sanitized reason text
 */
export function sanitizeReason(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return sanitizeHtml(input);
}
