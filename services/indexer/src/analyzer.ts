import {
  parseSkillMd,
  parseGenericInstructionFile,
  validateSkill,
  scanSecurity,
  type ParsedSkill,
  type SecurityReport,
  type ValidationResult,
  type SourceFormat,
} from 'skillhub-core';
import type { SkillContent, RepoMetadata } from './crawler.js';

export interface AnalysisResult {
  skill: ParsedSkill;
  security: SecurityReport;
  validation: ValidationResult;
  quality: QualityScore;
  meta: AnalysisMeta;
}

export interface QualityScore {
  overall: number; // 0-100
  documentation: number;
  maintenance: number;
  popularity: number;
  factors: QualityFactor[];
}

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  details?: string;
}

export interface AnalysisMeta {
  analyzedAt: Date;
  contentHash: string;
  version?: string;
}

/**
 * Analyze a skill for quality, security, and validity
 */
export class SkillAnalyzer {
  /**
   * Perform full analysis of a skill
   */
  analyze(content: SkillContent, sourceFormat: SourceFormat = 'skill.md'): AnalysisResult {
    let skill: ParsedSkill;

    if (sourceFormat === 'skill.md') {
      skill = parseSkillMd(content.skillMd);
    } else {
      skill = parseGenericInstructionFile(content.skillMd, sourceFormat, {
        name: content.repoMeta.description?.split(/\s+/).slice(0, 3).join('-') || 'skill',
        description: content.repoMeta.description,
        owner: '',
      });
    }

    // Run validation: relaxed for non-SKILL.md formats
    const validation = sourceFormat === 'skill.md'
      ? validateSkill(skill)
      : this.validateGenericFile(skill);

    // Run security scan (works the same for all formats)
    const security = scanSecurity({
      content: content.skillMd,
      scripts: content.scripts.map((s) => ({
        name: s.name,
        content: s.content,
      })),
    });

    // Calculate quality score
    const quality = this.calculateQuality(skill, content, security, validation);

    // Generate content hash
    const contentHash = this.hashContent(content.skillMd);

    return {
      skill,
      security,
      validation,
      quality,
      meta: {
        analyzedAt: new Date(),
        contentHash,
        version: skill.metadata.version,
      },
    };
  }

  /**
   * Relaxed validation for non-SKILL.md formats
   */
  private validateGenericFile(skill: ParsedSkill): ValidationResult {
    const errors = [...skill.validation.errors];
    const warnings = [...skill.validation.warnings];

    if (!skill.content || skill.content.trim().length === 0) {
      errors.push({
        code: 'EMPTY_CONTENT',
        message: 'Instruction file content is empty',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate quality score based on multiple factors
   */
  private calculateQuality(
    skill: ParsedSkill,
    content: SkillContent,
    security: SecurityReport,
    validation: ValidationResult
  ): QualityScore {
    const factors: QualityFactor[] = [];

    // Documentation quality (30% weight)
    const docScore = this.scoreDocumentation(skill, content);
    factors.push({
      name: 'documentation',
      score: docScore,
      weight: 0.3,
      details: this.getDocDetails(skill),
    });

    // Maintenance signals (25% weight)
    const maintScore = this.scoreMaintenance(content.repoMeta);
    factors.push({
      name: 'maintenance',
      score: maintScore,
      weight: 0.25,
      details: this.getMaintDetails(content.repoMeta),
    });

    // Popularity (20% weight)
    const popScore = this.scorePopularity(content.repoMeta);
    factors.push({
      name: 'popularity',
      score: popScore,
      weight: 0.2,
    });

    // Security (15% weight)
    factors.push({
      name: 'security',
      score: security.score,
      weight: 0.15,
    });

    // Validation (10% weight)
    const valScore = validation.isValid ? 100 : Math.max(0, 100 - validation.errors.length * 20);
    factors.push({
      name: 'validation',
      score: valScore,
      weight: 0.1,
    });

    // Calculate weighted overall score
    const overall = Math.round(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0)
    );

    return {
      overall,
      documentation: docScore,
      maintenance: maintScore,
      popularity: popScore,
      factors,
    };
  }

  /**
   * Score documentation quality
   */
  private scoreDocumentation(skill: ParsedSkill, content: SkillContent): number {
    let score = 0;

    // Has description (required)
    if (skill.metadata.description && skill.metadata.description.length > 20) {
      score += 20;
    }

    // Content length and structure
    const contentLength = skill.content.length;
    if (contentLength > 500) score += 15;
    else if (contentLength > 200) score += 10;
    else if (contentLength > 50) score += 5;

    // Has headers (good structure)
    const headerCount = (skill.content.match(/^#+\s/gm) || []).length;
    if (headerCount >= 3) score += 15;
    else if (headerCount >= 1) score += 10;

    // Has code examples
    if (skill.content.includes('```')) {
      score += 15;
    }

    // Has version
    if (skill.metadata.version) {
      score += 10;
    }

    // Has license
    if (skill.metadata.license) {
      score += 5;
    }

    // Has compatibility info
    if (skill.metadata.compatibility?.platforms?.length) {
      score += 10;
    }

    // Has scripts
    if (content.scripts.length > 0) {
      score += 5;
    }

    // Has references
    if (content.references.length > 0) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Score maintenance based on repo activity
   */
  private scoreMaintenance(repoMeta: RepoMetadata): number {
    let score = 0;

    // Check last update time
    const lastUpdate = new Date(repoMeta.updatedAt);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate < 30) score += 40;
    else if (daysSinceUpdate < 90) score += 30;
    else if (daysSinceUpdate < 180) score += 20;
    else if (daysSinceUpdate < 365) score += 10;

    // Has license
    if (repoMeta.license) {
      score += 20;
    }

    // Has description
    if (repoMeta.description) {
      score += 10;
    }

    // Has topics
    if (repoMeta.topics.length > 0) {
      score += 10;
    }

    // Activity level (forks indicate usage)
    if (repoMeta.forks >= 10) score += 20;
    else if (repoMeta.forks >= 5) score += 15;
    else if (repoMeta.forks >= 1) score += 10;

    return Math.min(100, score);
  }

  /**
   * Score popularity based on stars and forks
   */
  private scorePopularity(repoMeta: RepoMetadata): number {
    const stars = repoMeta.stars;
    const forks = repoMeta.forks;

    // Logarithmic scale for stars (more stars = diminishing returns)
    let score = 0;

    if (stars >= 1000) score += 50;
    else if (stars >= 100) score += 40;
    else if (stars >= 50) score += 30;
    else if (stars >= 10) score += 20;
    else if (stars >= 5) score += 10;
    else if (stars >= 1) score += 5;

    // Bonus for forks
    if (forks >= 50) score += 30;
    else if (forks >= 10) score += 20;
    else if (forks >= 5) score += 15;
    else if (forks >= 1) score += 10;

    // Bonus for relevant topics
    const relevantTopics = ['ai', 'agent', 'skill', 'claude', 'copilot', 'codex', 'llm'];
    const hasRelevantTopic = repoMeta.topics.some((t) =>
      relevantTopics.some((rt) => t.toLowerCase().includes(rt))
    );
    if (hasRelevantTopic) {
      score += 20;
    }

    return Math.min(100, score);
  }

  /**
   * Get documentation details for display
   */
  private getDocDetails(skill: ParsedSkill): string {
    const parts: string[] = [];

    if (skill.metadata.version) {
      parts.push(`v${skill.metadata.version}`);
    }

    if (skill.metadata.license) {
      parts.push(skill.metadata.license);
    }

    const platforms = skill.metadata.compatibility?.platforms;
    if (platforms?.length) {
      parts.push(platforms.join(', '));
    }

    return parts.join(' | ');
  }

  /**
   * Get maintenance details for display
   */
  private getMaintDetails(repoMeta: RepoMetadata): string {
    const lastUpdate = new Date(repoMeta.updatedAt);
    const daysAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAgo === 0) return 'Updated today';
    if (daysAgo === 1) return 'Updated yesterday';
    if (daysAgo < 7) return `Updated ${daysAgo} days ago`;
    if (daysAgo < 30) return `Updated ${Math.floor(daysAgo / 7)} weeks ago`;
    if (daysAgo < 365) return `Updated ${Math.floor(daysAgo / 30)} months ago`;
    return `Updated ${Math.floor(daysAgo / 365)} years ago`;
  }

  /**
   * Generate a simple hash of content for change detection
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

/**
 * Create a new SkillAnalyzer instance
 */
export function createAnalyzer(): SkillAnalyzer {
  return new SkillAnalyzer();
}
