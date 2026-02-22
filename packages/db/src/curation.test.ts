import { describe, it, expect } from 'vitest';

/**
 * Threshold-based tie-breaker logic for duplicate detection (T074b).
 * These tests validate the decision logic encoded in the SQL query.
 */

const REPO_AGE_THRESHOLD_DAYS = 75;

interface TieBreakCandidate {
  id: string;
  skillType: 'standalone' | 'collection' | 'aggregator';
  repoCreatedAt: Date | null;
  githubStars: number;
  githubForks: number;
  createdAt: Date;
}

/**
 * Determine if candidate `a` beats candidate `b` (i.e., `b` should be marked duplicate).
 * Returns true if `a` is the canonical (original) skill.
 * This mirrors the SQL tie-breaker logic in runPostCrawlCuration().
 */
function isCanonical(a: TieBreakCandidate, b: TieBreakCandidate): boolean {
  // Tier 1: standalone/collection beats aggregator
  if (a.skillType !== 'aggregator' && b.skillType === 'aggregator') return true;
  if (a.skillType === 'aggregator' && b.skillType !== 'aggregator') return false;

  // Only compare same-type from here
  const sameType = (a.skillType === 'aggregator') === (b.skillType === 'aggregator');
  if (!sameType) return false;

  // Tier 2: significant age gap (>75 days) → older repo wins
  if (a.repoCreatedAt && b.repoCreatedAt) {
    const gapMs = Math.abs(a.repoCreatedAt.getTime() - b.repoCreatedAt.getTime());
    const gapDays = gapMs / (1000 * 60 * 60 * 24);
    if (gapDays > REPO_AGE_THRESHOLD_DAYS) {
      return a.repoCreatedAt < b.repoCreatedAt;
    }
  }

  // Tier 3: more stars
  if (a.githubStars !== b.githubStars) return a.githubStars > b.githubStars;

  // Tier 4: more forks
  if (a.githubForks !== b.githubForks) return a.githubForks > b.githubForks;

  // Tier 5: older repo_created_at (minor difference)
  if (a.repoCreatedAt && b.repoCreatedAt && a.repoCreatedAt.getTime() !== b.repoCreatedAt.getTime()) {
    return a.repoCreatedAt < b.repoCreatedAt;
  }

  // Tier 6: older created_at (SkillHub indexing date)
  return a.createdAt < b.createdAt;
}

describe('Duplicate Tie-Breaker Logic', () => {
  const baseDate = new Date('2024-01-01');
  const daysAgo = (days: number) => new Date(baseDate.getTime() - days * 86400000);

  describe('Tier 1: standalone vs aggregator', () => {
    it('standalone beats aggregator regardless of stars', () => {
      const standalone: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(10),
        githubStars: 5, githubForks: 0, createdAt: daysAgo(1),
      };
      const aggregator: TieBreakCandidate = {
        id: 'b', skillType: 'aggregator', repoCreatedAt: daysAgo(200),
        githubStars: 5000, githubForks: 500, createdAt: daysAgo(100),
      };
      expect(isCanonical(standalone, aggregator)).toBe(true);
      expect(isCanonical(aggregator, standalone)).toBe(false);
    });

    it('collection beats aggregator', () => {
      const collection: TieBreakCandidate = {
        id: 'a', skillType: 'collection', repoCreatedAt: daysAgo(10),
        githubStars: 10, githubForks: 1, createdAt: daysAgo(1),
      };
      const aggregator: TieBreakCandidate = {
        id: 'b', skillType: 'aggregator', repoCreatedAt: daysAgo(300),
        githubStars: 1000, githubForks: 100, createdAt: daysAgo(200),
      };
      expect(isCanonical(collection, aggregator)).toBe(true);
    });
  });

  describe('Tier 2: significant age gap (>75 days)', () => {
    it('older repo wins when gap > 75 days', () => {
      const older: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(200),
        githubStars: 10, githubForks: 1, createdAt: daysAgo(5),
      };
      const newer: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(50),
        githubStars: 500, githubForks: 50, createdAt: daysAgo(3),
      };
      // Gap = 150 days > 75 → older wins despite fewer stars
      expect(isCanonical(older, newer)).toBe(true);
      expect(isCanonical(newer, older)).toBe(false);
    });

    it('does NOT apply when gap <= 75 days', () => {
      const olderButClose: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(100),
        githubStars: 10, githubForks: 1, createdAt: daysAgo(5),
      };
      const newerButMoreStars: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(50),
        githubStars: 500, githubForks: 50, createdAt: daysAgo(3),
      };
      // Gap = 50 days <= 75 → falls through to Tier 3 (stars)
      expect(isCanonical(newerButMoreStars, olderButClose)).toBe(true);
    });

    it('exactly 75 days falls through to stars', () => {
      const a: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(100),
        githubStars: 10, githubForks: 0, createdAt: daysAgo(5),
      };
      const b: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(25),
        githubStars: 50, githubForks: 0, createdAt: daysAgo(3),
      };
      // Gap = exactly 75 days → NOT > 75, so falls to stars
      expect(isCanonical(b, a)).toBe(true);
    });
  });

  describe('Tier 3-4: stars and forks (close dates or NULL)', () => {
    it('more stars wins when dates are close', () => {
      const moreStars: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(100),
        githubStars: 500, githubForks: 10, createdAt: daysAgo(5),
      };
      const fewerStars: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(80),
        githubStars: 50, githubForks: 5, createdAt: daysAgo(3),
      };
      // Gap = 20 days < 75 → stars decide
      expect(isCanonical(moreStars, fewerStars)).toBe(true);
    });

    it('more stars wins when both repo_created_at are NULL', () => {
      const moreStars: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: null,
        githubStars: 100, githubForks: 10, createdAt: daysAgo(30),
      };
      const fewerStars: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: null,
        githubStars: 50, githubForks: 5, createdAt: daysAgo(20),
      };
      expect(isCanonical(moreStars, fewerStars)).toBe(true);
    });

    it('one NULL one not → skip Tier 2, use stars', () => {
      const withDate: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(200),
        githubStars: 10, githubForks: 0, createdAt: daysAgo(5),
      };
      const noDate: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: null,
        githubStars: 500, githubForks: 50, createdAt: daysAgo(30),
      };
      // One is NULL → can't compare age → falls to stars
      expect(isCanonical(noDate, withDate)).toBe(true);
    });

    it('forks break ties when stars are equal', () => {
      const moreForks: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(50),
        githubStars: 100, githubForks: 30, createdAt: daysAgo(5),
      };
      const fewerForks: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(40),
        githubStars: 100, githubForks: 10, createdAt: daysAgo(3),
      };
      expect(isCanonical(moreForks, fewerForks)).toBe(true);
    });
  });

  describe('Tier 5-6: final tie-breakers', () => {
    it('older repo_created_at wins when stars and forks are equal', () => {
      const older: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: daysAgo(60),
        githubStars: 100, githubForks: 10, createdAt: daysAgo(5),
      };
      const newer: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: daysAgo(30),
        githubStars: 100, githubForks: 10, createdAt: daysAgo(3),
      };
      // Gap = 30 days < 75 → stars equal, forks equal → Tier 5: older repo wins
      expect(isCanonical(older, newer)).toBe(true);
    });

    it('older created_at wins when everything else is equal or NULL', () => {
      const olderIndex: TieBreakCandidate = {
        id: 'a', skillType: 'standalone', repoCreatedAt: null,
        githubStars: 100, githubForks: 10, createdAt: daysAgo(30),
      };
      const newerIndex: TieBreakCandidate = {
        id: 'b', skillType: 'standalone', repoCreatedAt: null,
        githubStars: 100, githubForks: 10, createdAt: daysAgo(5),
      };
      // All NULL/equal → Tier 6: SkillHub index date
      expect(isCanonical(olderIndex, newerIndex)).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('creator wins over older aggregator repo with more stars', () => {
      const creator: TieBreakCandidate = {
        id: 'creator/tool/skill', skillType: 'standalone',
        repoCreatedAt: new Date('2024-06-01'), githubStars: 50,
        githubForks: 5, createdAt: daysAgo(30),
      };
      const aggregator: TieBreakCandidate = {
        id: 'collector/awesome/skill', skillType: 'aggregator',
        repoCreatedAt: new Date('2020-01-01'), githubStars: 2000,
        githubForks: 200, createdAt: daysAgo(60),
      };
      // Tier 1: standalone beats aggregator
      expect(isCanonical(creator, aggregator)).toBe(true);
    });

    it('old repo copying recently still wins with >75 day gap (accepted trade-off)', () => {
      const oldCopier: TieBreakCandidate = {
        id: 'old/project/skill', skillType: 'standalone',
        repoCreatedAt: new Date('2020-01-01'), githubStars: 30,
        githubForks: 2, createdAt: daysAgo(10),
      };
      const originalCreator: TieBreakCandidate = {
        id: 'new/creator/skill', skillType: 'standalone',
        repoCreatedAt: new Date('2024-11-01'), githubStars: 100,
        githubForks: 15, createdAt: daysAgo(30),
      };
      // Gap > 75 days → old repo wins (accepted rare trade-off)
      expect(isCanonical(oldCopier, originalCreator)).toBe(true);
    });

    it('recent copier loses to original when gap < 75 days', () => {
      const original: TieBreakCandidate = {
        id: 'original/skill/md', skillType: 'standalone',
        repoCreatedAt: new Date('2024-10-01'), githubStars: 200,
        githubForks: 20, createdAt: daysAgo(60),
      };
      const copier: TieBreakCandidate = {
        id: 'copier/skill/md', skillType: 'standalone',
        repoCreatedAt: new Date('2024-11-01'), githubStars: 50,
        githubForks: 3, createdAt: daysAgo(30),
      };
      // Gap = 31 days < 75 → stars decide → original (200) > copier (50)
      expect(isCanonical(original, copier)).toBe(true);
    });
  });
});
