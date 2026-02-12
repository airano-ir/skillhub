/**
 * Number formatting utilities for localization
 * Supports Persian (Farsi) digit conversion
 */

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/**
 * Convert a number or string to Persian digits
 */
export function toPersianNumber(num: number | string): string {
  return String(num).replace(/\d/g, (d) => persianDigits[parseInt(d, 10)]);
}

/**
 * Format a number with locale-aware digit conversion
 * @param num - The number to format
 * @param locale - The locale ('fa' for Persian, 'en' for English)
 * @returns Formatted string with appropriate digits
 */
export function formatNumber(num: number, locale: string): string {
  const formatted = num.toString();
  return locale === 'fa' ? toPersianNumber(formatted) : formatted;
}

/**
 * Format a number with abbreviation (k, M) and locale-aware digits
 * @param num - The number to format
 * @param locale - The locale ('fa' for Persian, 'en' for English)
 * @returns Abbreviated formatted string (e.g., "1.5k" or "۱.۵k")
 */
export function formatCompactNumber(num: number, locale: string): string {
  let formatted: string;

  if (num >= 1000000) {
    formatted = (num / 1000000).toFixed(1) + 'M+';
  } else if (num >= 1000) {
    formatted = (num / 1000).toFixed(1) + 'k';
  } else {
    formatted = num.toString();
  }

  return locale === 'fa' ? toPersianNumber(formatted) : formatted;
}

/**
 * Format a number with thousand separators and locale-aware digits
 * @param num - The number to format
 * @param locale - The locale ('fa' for Persian, 'en' for English)
 * @returns Formatted string with thousand separators
 */
export function formatWithSeparators(num: number, locale: string): string {
  const formatted = num.toLocaleString('en-US');
  return locale === 'fa' ? toPersianNumber(formatted) : formatted;
}

/**
 * Format a skill count for prompt text (always English, rounded to nearest 5000)
 * Used in discovery prompts that users copy into CLAUDE.md
 */
export function formatPromptSkillCount(count: number): string {
  const rounded = Math.floor(count / 5000) * 5000;
  return `${rounded.toLocaleString('en-US')}+`;
}
