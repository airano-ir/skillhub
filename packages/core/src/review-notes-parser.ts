/**
 * Parser for structured review_notes from the AI review pipeline.
 *
 * Review notes use tagged sections like:
 *   RATIONALE: ...
 *   USE-CASES: csv-cleaning, pdf-generation
 *   AUDIENCE: data-analysts
 *   MATURITY: production
 *   COMPLEXITY: complex
 *   DEPENDENCIES: node, bash
 *   PLATFORM: cross-platform
 *   COMPLEMENTS: context-manager
 *   SEO-EN: One-line summary
 *   BUNDLE-FIT: productivity
 *   FRAMEWORK-LOCK: none
 *   CONTRIBUTING-REPO: none
 */

export interface ParsedReviewNotes {
  /** Free-text summary before the first structured tag */
  summary: string;
  rationale: string | null;
  useCases: string[];
  audience: string[];
  complements: string[];
  seoEn: string | null;
  bundleFit: string | null;
  frameworkLock: string | null;
  contributingRepo: string | null;
  maturity: 'prototype' | 'beta' | 'production' | null;
  complexity: 'simple' | 'moderate' | 'complex' | null;
  dependencies: string[];
  platform: string | null;
}

const TAG_KEYS = [
  'RATIONALE',
  'USE-CASES',
  'AUDIENCE',
  'COMPLEMENTS',
  'SEO-EN',
  'BUNDLE-FIT',
  'FRAMEWORK-LOCK',
  'CONTRIBUTING-REPO',
  'MATURITY',
  'COMPLEXITY',
  'DEPENDENCIES',
  'PLATFORM',
] as const;

// Build regex that matches any tag at the start of a segment
const TAG_REGEX = new RegExp(`(${TAG_KEYS.join('|')}):\\s*`, 'g');

function splitComma(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeNone(val: string): string | null {
  const lower = val.trim().toLowerCase();
  return lower === 'none' || lower === 'n/a' || lower === '' ? null : val.trim();
}

export function parseReviewNotes(notes: string | null | undefined): ParsedReviewNotes {
  const empty: ParsedReviewNotes = {
    summary: '',
    rationale: null,
    useCases: [],
    audience: [],
    complements: [],
    seoEn: null,
    bundleFit: null,
    frameworkLock: null,
    contributingRepo: null,
    maturity: null,
    complexity: null,
    dependencies: [],
    platform: null,
  };

  if (!notes) return empty;

  // Normalize escaped newlines to real newlines
  const normalized = notes.replace(/\\n/g, '\n');

  // Extract tags and their values
  const tags: Record<string, string> = {};
  let summary = '';

  // Find the first tag position
  TAG_REGEX.lastIndex = 0;
  const firstMatch = TAG_REGEX.exec(normalized);
  const firstTagPos = firstMatch ? firstMatch.index : normalized.length;

  // Everything before the first tag is the summary
  summary = normalized.slice(0, firstTagPos).trim();

  // Parse all tag: value pairs
  const tagMatches: Array<{ tag: string; start: number; valueStart: number }> = [];
  TAG_REGEX.lastIndex = 0;
  let match;
  while ((match = TAG_REGEX.exec(normalized)) !== null) {
    tagMatches.push({
      tag: match[1],
      start: match.index,
      valueStart: match.index + match[0].length,
    });
  }

  for (let i = 0; i < tagMatches.length; i++) {
    const current = tagMatches[i];
    const nextStart = i + 1 < tagMatches.length ? tagMatches[i + 1].start : normalized.length;
    const value = normalized.slice(current.valueStart, nextStart).trim();
    tags[current.tag] = value;
  }

  const maturityVal = tags['MATURITY']?.trim().toLowerCase();
  const complexityVal = tags['COMPLEXITY']?.trim().toLowerCase();

  return {
    summary,
    rationale: tags['RATIONALE']?.trim() || null,
    useCases: tags['USE-CASES'] ? splitComma(tags['USE-CASES']) : [],
    audience: tags['AUDIENCE'] ? splitComma(tags['AUDIENCE']) : [],
    complements: tags['COMPLEMENTS'] ? splitComma(tags['COMPLEMENTS']) : [],
    seoEn: normalizeNone(tags['SEO-EN'] || ''),
    bundleFit: normalizeNone(tags['BUNDLE-FIT'] || ''),
    frameworkLock: normalizeNone(tags['FRAMEWORK-LOCK'] || ''),
    contributingRepo: normalizeNone(tags['CONTRIBUTING-REPO'] || ''),
    maturity: maturityVal === 'prototype' || maturityVal === 'beta' || maturityVal === 'production'
      ? maturityVal
      : null,
    complexity: complexityVal === 'simple' || complexityVal === 'moderate' || complexityVal === 'complex'
      ? complexityVal
      : null,
    dependencies: tags['DEPENDENCIES'] ? splitComma(tags['DEPENDENCIES']) : [],
    platform: normalizeNone(tags['PLATFORM'] || ''),
  };
}
