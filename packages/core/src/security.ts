import type { SecurityReport, SecurityIssue, SecurityIssueType, SecurityStatus } from './types.js';

interface ScanInput {
  content: string;
  scripts?: Array<{ name: string; content: string }>;
}

interface PatternCheck {
  pattern: RegExp;
  severity: SecurityIssue['severity'];
  type: SecurityIssueType;
  description: string;
}

const DANGEROUS_SHELL_PATTERNS: PatternCheck[] = [
  {
    pattern: /rm\s+-rf\s+[/~]/,
    severity: 'critical',
    type: 'destructive_command',
    description: 'Recursive force delete from root or home directory',
  },
  {
    pattern: /rm\s+-rf\s+\$\{?\w+\}?\/?\s*$/,
    severity: 'high',
    type: 'destructive_command',
    description: 'Recursive delete with variable path (potential injection)',
  },
  {
    pattern: /curl.*\|\s*(ba)?sh/,
    severity: 'critical',
    type: 'remote_execution',
    description: 'Piping curl output directly to shell',
  },
  {
    pattern: /wget.*\|\s*(ba)?sh/,
    severity: 'critical',
    type: 'remote_execution',
    description: 'Piping wget output directly to shell',
  },
  {
    pattern: /wget.*&&.*chmod.*\+x/,
    severity: 'high',
    type: 'download_execute',
    description: 'Download and make executable pattern',
  },
  {
    pattern: /eval\s*\(/,
    severity: 'high',
    type: 'eval_usage',
    description: 'Use of eval() function',
  },
  {
    pattern: /eval\s+["'`$]/,
    severity: 'high',
    type: 'eval_usage',
    description: 'Shell eval with dynamic content',
  },
  {
    pattern: /exec\s*\(/,
    severity: 'medium',
    type: 'exec_usage',
    description: 'Use of exec() function',
  },
  {
    pattern: /subprocess\.call.*shell\s*=\s*True/,
    severity: 'medium',
    type: 'shell_injection',
    description: 'Python subprocess with shell=True',
  },
  {
    pattern: /os\.system\s*\(/,
    severity: 'medium',
    type: 'shell_injection',
    description: 'Python os.system call',
  },
  {
    pattern: /child_process\.exec\(/,
    severity: 'medium',
    type: 'shell_injection',
    description: 'Node.js child_process.exec (prefer execFile)',
  },
];

const PROMPT_INJECTION_PATTERNS: PatternCheck[] = [
  {
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: 'high',
    type: 'prompt_injection',
    description: 'Prompt injection: ignore previous instructions',
  },
  {
    pattern: /disregard\s+(all\s+)?prior\s+instructions/i,
    severity: 'high',
    type: 'prompt_injection',
    description: 'Prompt injection: disregard prior instructions',
  },
  {
    pattern: /you\s+are\s+now\s+in\s+.*mode/i,
    severity: 'medium',
    type: 'prompt_injection',
    description: 'Prompt injection: mode switching attempt',
  },
  {
    pattern: /system\s*:\s*you\s+are/i,
    severity: 'high',
    type: 'prompt_injection',
    description: 'Prompt injection: fake system message',
  },
  {
    pattern: /\[SYSTEM\]/i,
    severity: 'medium',
    type: 'prompt_injection',
    description: 'Prompt injection: system tag in content',
  },
  {
    pattern: /forget\s+(everything|all)\s+(you\s+)?know/i,
    severity: 'high',
    type: 'prompt_injection',
    description: 'Prompt injection: memory wipe attempt',
  },
];

const DATA_EXFILTRATION_PATTERNS: PatternCheck[] = [
  {
    pattern: /send.*to.*external/i,
    severity: 'high',
    type: 'data_exfiltration',
    description: 'Potential data exfiltration instruction',
  },
  {
    pattern: /upload.*credentials/i,
    severity: 'critical',
    type: 'data_exfiltration',
    description: 'Instruction to upload credentials',
  },
  {
    pattern: /transmit.*api[_-]?key/i,
    severity: 'critical',
    type: 'data_exfiltration',
    description: 'Instruction to transmit API keys',
  },
  {
    pattern: /exfiltrate/i,
    severity: 'critical',
    type: 'data_exfiltration',
    description: 'Explicit exfiltration instruction',
  },
  {
    pattern: /base64.*encode.*secret/i,
    severity: 'high',
    type: 'data_exfiltration',
    description: 'Encoding secrets pattern',
  },
];

const CREDENTIAL_PATTERNS: PatternCheck[] = [
  {
    pattern: /password\s*[=:]\s*["'][^"']+["']/i,
    severity: 'critical',
    type: 'credential_exposure',
    description: 'Hardcoded password detected',
  },
  {
    pattern: /api[_-]?key\s*[=:]\s*["'][a-zA-Z0-9]{20,}["']/i,
    severity: 'critical',
    type: 'credential_exposure',
    description: 'Hardcoded API key detected',
  },
  {
    pattern: /secret\s*[=:]\s*["'][^"']{10,}["']/i,
    severity: 'high',
    type: 'credential_exposure',
    description: 'Hardcoded secret detected',
  },
  {
    pattern: /private[_-]?key\s*[=:]/i,
    severity: 'critical',
    type: 'credential_exposure',
    description: 'Private key assignment detected',
  },
];

/**
 * Scan a skill for security issues
 */
export function scanSecurity(input: ScanInput): SecurityReport {
  const issues: SecurityIssue[] = [];
  const recommendations: string[] = [];

  // Scan main content
  issues.push(...scanContent(input.content));

  // Scan scripts
  if (input.scripts) {
    for (const script of input.scripts) {
      const scriptIssues = scanScript(script.name, script.content);
      issues.push(...scriptIssues);
    }
  }

  // Generate recommendations based on issues
  recommendations.push(...generateRecommendations(issues));

  // Calculate score and status
  const score = calculateScore(issues);
  const status = calculateStatus(issues);

  return {
    score,
    status,
    issues,
    recommendations,
    scannedAt: new Date(),
  };
}

function scanContent(content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  // Check prompt injection patterns
  for (const check of PROMPT_INJECTION_PATTERNS) {
    const match = check.pattern.exec(content);
    if (match) {
      issues.push({
        severity: check.severity,
        type: check.type,
        description: check.description,
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Check data exfiltration patterns
  for (const check of DATA_EXFILTRATION_PATTERNS) {
    const match = check.pattern.exec(content);
    if (match) {
      issues.push({
        severity: check.severity,
        type: check.type,
        description: check.description,
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Check credential patterns
  for (const check of CREDENTIAL_PATTERNS) {
    const match = check.pattern.exec(content);
    if (match) {
      issues.push({
        severity: check.severity,
        type: check.type,
        description: check.description,
        line: getLineNumber(content, match.index),
      });
    }
  }

  return issues;
}

function scanScript(name: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  // Check dangerous shell patterns
  for (const check of DANGEROUS_SHELL_PATTERNS) {
    const match = check.pattern.exec(content);
    if (match) {
      issues.push({
        severity: check.severity,
        type: check.type,
        description: check.description,
        location: name,
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Check credential patterns in scripts
  for (const check of CREDENTIAL_PATTERNS) {
    const match = check.pattern.exec(content);
    if (match) {
      issues.push({
        severity: check.severity,
        type: check.type,
        description: check.description,
        location: name,
        line: getLineNumber(content, match.index),
      });
    }
  }

  return issues;
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

function calculateScore(issues: SecurityIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        score -= 30;
        break;
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate security status based on issues
 * - FAIL: Any critical issue
 * - WARNING: Any high severity issue (no critical)
 * - PASS: Only medium/low or no issues
 */
function calculateStatus(issues: SecurityIssue[]): SecurityStatus {
  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasHigh = issues.some((i) => i.severity === 'high');

  if (hasCritical) return 'fail';
  if (hasHigh) return 'warning';
  return 'pass';
}

function generateRecommendations(issues: SecurityIssue[]): string[] {
  const recommendations: string[] = [];
  const issueTypes = new Set(issues.map((i) => i.type));

  if (issueTypes.has('remote_execution')) {
    recommendations.push(
      'Review and verify all remote code execution patterns. Consider downloading scripts first and reviewing them before execution.'
    );
  }

  if (issueTypes.has('prompt_injection')) {
    recommendations.push(
      'Remove or sanitize prompt injection patterns. These can cause unpredictable AI behavior.'
    );
  }

  if (issueTypes.has('data_exfiltration')) {
    recommendations.push(
      'Remove instructions that could lead to data exfiltration. Never instruct AI to send sensitive data externally.'
    );
  }

  if (issueTypes.has('credential_exposure')) {
    recommendations.push(
      'Remove all hardcoded credentials. Use environment variables or secure credential management.'
    );
  }

  if (issueTypes.has('eval_usage') || issueTypes.has('exec_usage')) {
    recommendations.push(
      'Avoid using eval() and exec(). Use safer alternatives that do not execute arbitrary code.'
    );
  }

  if (issueTypes.has('shell_injection')) {
    recommendations.push(
      'Use parameterized commands instead of shell string interpolation. Prefer execFile over exec.'
    );
  }

  if (issueTypes.has('destructive_command')) {
    recommendations.push(
      'Review destructive commands carefully. Add safeguards and confirmations before deletion operations.'
    );
  }

  if (recommendations.length === 0 && issues.length === 0) {
    recommendations.push('No security issues detected. The skill appears safe.');
  }

  return recommendations;
}

/**
 * Quick security check - returns true if no critical issues found
 */
export function isSecure(input: ScanInput): boolean {
  const report = scanSecurity(input);
  return !report.issues.some((i) => i.severity === 'critical');
}

/**
 * Get security score color for display (deprecated, use getStatusColor)
 */
export function getScoreColor(score: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (score >= 90) return 'green';
  if (score >= 70) return 'yellow';
  if (score >= 50) return 'orange';
  return 'red';
}

/**
 * Get color for security status
 */
export function getStatusColor(status: SecurityStatus): 'green' | 'yellow' | 'red' {
  switch (status) {
    case 'pass':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'fail':
      return 'red';
  }
}

/**
 * Convert numeric score to status (for migrating existing data)
 */
export function scoreToStatus(score: number): SecurityStatus {
  if (score >= 70) return 'pass';
  if (score >= 30) return 'warning';
  return 'fail';
}

/**
 * Get display label for status
 */
export function getStatusLabel(status: SecurityStatus): { en: string; fa: string } {
  switch (status) {
    case 'pass':
      return { en: 'Safe', fa: 'امن' };
    case 'warning':
      return { en: 'Caution', fa: 'احتیاط' };
    case 'fail':
      return { en: 'Unsafe', fa: 'ناامن' };
  }
}
