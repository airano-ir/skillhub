-- Add Parent Categories for Hierarchical Structure (Phase 2)
-- Version: 1.0
-- Date: February 2026
--
-- This script adds 7 parent "chapter" categories and links existing 23 categories to them.
-- Parent categories have skill_count = 0 (skills are only assigned to leaf categories).

-- Insert 7 parent categories
INSERT INTO categories (id, name, slug, description, icon, color, sort_order, skill_count, created_at)
VALUES
  ('parent-dev', 'Development', 'development', 'Software development and programming tools', 'Code2', '#3B82F6', 1, 0, NOW()),
  ('parent-ai', 'AI & Automation', 'ai-automation', 'Artificial intelligence and automation tools', 'Brain', '#8B5CF6', 2, 0, NOW()),
  ('parent-data', 'Data & Documents', 'data-documents', 'Data management and document processing', 'Database', '#10B981', 3, 0, NOW()),
  ('parent-devops', 'DevOps & Security', 'devops-security', 'Infrastructure, deployment, and security tools', 'Cloud', '#F97316', 4, 0, NOW()),
  ('parent-business', 'Business & Productivity', 'business-productivity', 'Business tools and productivity applications', 'Briefcase', '#22C55E', 5, 0, NOW()),
  ('parent-media', 'Media & IoT', 'media-iot', 'Multimedia processing and smart device integrations', 'Music', '#F43F5E', 6, 0, NOW()),
  ('parent-specialized', 'Specialized', 'specialized', 'Specialized tools for niche domains', 'Sparkles', '#6B7280', 7, 0, NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

-- Link child categories to parents
-- Development group (4 categories)
UPDATE categories SET parent_id = 'parent-dev' WHERE id IN ('cat-backend', 'cat-frontend', 'cat-mobile', 'cat-languages');

-- AI & Automation group (3 categories)
UPDATE categories SET parent_id = 'parent-ai' WHERE id IN ('cat-ai-llm', 'cat-agents', 'cat-prompts');

-- Data & Documents group (2 categories)
UPDATE categories SET parent_id = 'parent-data' WHERE id IN ('cat-data', 'cat-documents');

-- DevOps & Security group (4 categories)
UPDATE categories SET parent_id = 'parent-devops' WHERE id IN ('cat-devops', 'cat-git', 'cat-testing', 'cat-security');

-- Business & Productivity group (4 categories)
UPDATE categories SET parent_id = 'parent-business' WHERE id IN ('cat-productivity', 'cat-business', 'cat-social', 'cat-content');

-- Media & IoT group (2 categories)
UPDATE categories SET parent_id = 'parent-media' WHERE id IN ('cat-multimedia', 'cat-iot');

-- Specialized group (4 categories)
UPDATE categories SET parent_id = 'parent-specialized' WHERE id IN ('cat-science', 'cat-blockchain', 'cat-mcp', 'cat-other');

-- Update sort_order for child categories within their groups
-- Development children (sort: 10-19)
UPDATE categories SET sort_order = 10 WHERE id = 'cat-backend';
UPDATE categories SET sort_order = 11 WHERE id = 'cat-frontend';
UPDATE categories SET sort_order = 12 WHERE id = 'cat-mobile';
UPDATE categories SET sort_order = 13 WHERE id = 'cat-languages';

-- AI children (sort: 20-29)
UPDATE categories SET sort_order = 20 WHERE id = 'cat-ai-llm';
UPDATE categories SET sort_order = 21 WHERE id = 'cat-agents';
UPDATE categories SET sort_order = 22 WHERE id = 'cat-prompts';

-- Data children (sort: 30-39)
UPDATE categories SET sort_order = 30 WHERE id = 'cat-data';
UPDATE categories SET sort_order = 31 WHERE id = 'cat-documents';

-- DevOps children (sort: 40-49)
UPDATE categories SET sort_order = 40 WHERE id = 'cat-devops';
UPDATE categories SET sort_order = 41 WHERE id = 'cat-git';
UPDATE categories SET sort_order = 42 WHERE id = 'cat-testing';
UPDATE categories SET sort_order = 43 WHERE id = 'cat-security';

-- Business children (sort: 50-59)
UPDATE categories SET sort_order = 50 WHERE id = 'cat-productivity';
UPDATE categories SET sort_order = 51 WHERE id = 'cat-business';
UPDATE categories SET sort_order = 52 WHERE id = 'cat-social';
UPDATE categories SET sort_order = 53 WHERE id = 'cat-content';

-- Media children (sort: 60-69)
UPDATE categories SET sort_order = 60 WHERE id = 'cat-multimedia';
UPDATE categories SET sort_order = 61 WHERE id = 'cat-iot';

-- Specialized children (sort: 70-79)
UPDATE categories SET sort_order = 70 WHERE id = 'cat-science';
UPDATE categories SET sort_order = 71 WHERE id = 'cat-blockchain';
UPDATE categories SET sort_order = 72 WHERE id = 'cat-mcp';
UPDATE categories SET sort_order = 73 WHERE id = 'cat-other';

-- Verify the hierarchy
SELECT
  COALESCE(p.name, '(No Parent)') as parent,
  c.id,
  c.name,
  c.skill_count,
  c.sort_order
FROM categories c
LEFT JOIN categories p ON c.parent_id = p.id
WHERE c.id NOT LIKE 'parent-%'
ORDER BY COALESCE(p.sort_order, 999), c.sort_order;
