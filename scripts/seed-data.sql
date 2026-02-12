-- SkillHub Sample Data Seed Script
-- Run this after init-db.sql to populate sample data for development/testing

-- Insert sample skills
INSERT INTO skills (id, name, description, github_owner, github_repo, skill_path, branch, version, license, github_stars, download_count, security_score, is_verified, compatibility, indexed_at) VALUES
-- Anthropic Skills
('anthropic/skills/code-review', 'code-review', 'Comprehensive code review skill that analyzes code quality, security, and best practices. Supports multiple programming languages and provides actionable feedback.', 'anthropic', 'skills', 'code-review', 'main', '2.1.0', 'MIT', 2847, 15420, 95, true, '{"platforms": ["claude", "codex"]}', NOW()),
('anthropic/skills/security-audit', 'security-audit', 'Perform comprehensive security audits on your codebase. Identifies vulnerabilities, suggests fixes, and follows OWASP guidelines.', 'anthropic', 'skills', 'security-audit', 'main', '1.8.0', 'MIT', 1876, 9500, 99, true, '{"platforms": ["claude"]}', NOW()),
('anthropic/skills/commit-message', 'commit-message', 'Generate meaningful and conventional commit messages based on your staged changes. Follows conventional commits specification.', 'anthropic', 'skills', 'commit-message', 'main', '1.3.0', 'MIT', 1650, 8900, 94, true, '{"platforms": ["claude", "copilot"]}', NOW()),

-- OpenAI Skills
('openai/skills/test-generator', 'test-generator', 'Automatically generate unit tests for your code with comprehensive coverage. Supports Jest, Pytest, Go testing, and more.', 'openai', 'skills', 'test-generator', 'main', '1.5.0', 'MIT', 1923, 8932, 92, true, '{"platforms": ["codex", "copilot"]}', NOW()),

-- Microsoft Skills
('microsoft/copilot-skills/refactor', 'refactor', 'Intelligent code refactoring with support for multiple programming languages. Improves code quality while preserving functionality.', 'microsoft', 'copilot-skills', 'refactor', 'main', '3.0.0', 'MIT', 3421, 21000, 97, true, '{"platforms": ["copilot", "claude"]}', NOW()),

-- Community Skills
('community/skills/documentation', 'documentation', 'Generate beautiful documentation from your codebase automatically. Supports JSDoc, docstrings, and markdown output.', 'community', 'skills', 'documentation', 'main', '1.2.0', 'Apache-2.0', 1456, 6721, 88, false, '{"platforms": ["claude", "codex", "copilot"]}', NOW()),
('community/ai-tools/api-generator', 'api-generator', 'Generate REST APIs from specifications automatically. Supports OpenAPI, GraphQL, and gRPC.', 'community', 'ai-tools', 'api-generator', 'main', '1.0.0', 'Apache-2.0', 890, 4200, 85, false, '{"platforms": ["claude", "codex"]}', NOW()),

-- Devin Skills
('devin/skills/debug-assistant', 'debug-assistant', 'AI-powered debugging assistant that helps identify and fix bugs. Analyzes stack traces, suggests solutions, and explains errors.', 'devin', 'skills', 'debug-assistant', 'main', '2.0.0', 'MIT', 2100, 12000, 91, true, '{"platforms": ["claude", "codex", "copilot"]}', NOW()),

-- Additional skills for variety
('cursor/skills/autocomplete-pro', 'autocomplete-pro', 'Advanced code autocomplete with context-aware suggestions. Learns from your codebase patterns.', 'cursor', 'skills', 'autocomplete-pro', 'main', '2.5.0', 'MIT', 4500, 32000, 93, true, '{"platforms": ["claude", "codex", "copilot"]}', NOW()),
('github/copilot-skills/pr-review', 'pr-review', 'Automated pull request review with detailed feedback on code changes, potential issues, and suggestions.', 'github', 'copilot-skills', 'pr-review', 'main', '1.4.0', 'MIT', 2300, 14500, 96, true, '{"platforms": ["copilot", "claude"]}', NOW())

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  github_stars = EXCLUDED.github_stars,
  download_count = EXCLUDED.download_count,
  security_score = EXCLUDED.security_score,
  indexed_at = NOW();

-- Link skills to categories (using IDs from categories.sql)
INSERT INTO skill_categories (skill_id, category_id) VALUES
('anthropic/skills/code-review', 'cat-development'),
('anthropic/skills/security-audit', 'cat-security'),
('anthropic/skills/commit-message', 'cat-productivity'),
('openai/skills/test-generator', 'cat-testing'),
('microsoft/copilot-skills/refactor', 'cat-development'),
('community/skills/documentation', 'cat-writing'),
('community/ai-tools/api-generator', 'cat-api'),
('devin/skills/debug-assistant', 'cat-development'),
('cursor/skills/autocomplete-pro', 'cat-development'),
('github/copilot-skills/pr-review', 'cat-development')
ON CONFLICT DO NOTHING;

-- Update category skill counts
UPDATE categories SET skill_count = (
  SELECT COUNT(*) FROM skill_categories WHERE category_id = categories.id
);

-- Show results
SELECT 'Skills inserted:' as info, COUNT(*) as count FROM skills;
SELECT 'Categories with skills:' as info, COUNT(*) as count FROM categories WHERE skill_count > 0;
