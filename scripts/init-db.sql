-- SkillHub Database Initialization Script
-- This script runs automatically when PostgreSQL container starts
-- Matches the Drizzle ORM schema in packages/db/src/schema.ts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create skills table (main entity)
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,

    -- Source info
    github_owner TEXT NOT NULL,
    github_repo TEXT NOT NULL,
    skill_path TEXT NOT NULL,
    branch TEXT DEFAULT 'main',
    commit_sha TEXT,

    -- Source format (which platform's instruction file format)
    source_format TEXT DEFAULT 'skill.md',

    -- Metadata
    version TEXT,
    license TEXT,
    author TEXT,
    homepage TEXT,
    compatibility JSONB,
    triggers JSONB,

    -- Quality signals
    github_stars INTEGER DEFAULT 0,
    github_forks INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- Ratings
    rating INTEGER,
    rating_count INTEGER DEFAULT 0,
    rating_sum INTEGER DEFAULT 0,

    -- Security
    security_score INTEGER,  -- 0-100 (deprecated, use security_status)
    security_status TEXT,  -- 'pass', 'warning', 'fail'
    is_verified BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,  -- Blocked from re-indexing (owner requested removal)
    last_scanned TIMESTAMP WITH TIME ZONE,

    -- Review pipeline
    review_status TEXT DEFAULT 'unreviewed',  -- 'unreviewed', 'auto-scored', 'ai-reviewed', 'verified', 'needs-re-review'

    -- Content
    content_hash TEXT,
    raw_content TEXT,

    -- Cached skill files (populated on first download)
    -- Structure: { fetchedAt, commitSha, totalSize, items: [{name, path, content, size, isBinary}] }
    cached_files JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    repo_created_at TIMESTAMP WITH TIME ZONE,
    indexed_at TIMESTAMP WITH TIME ZONE,
    last_downloaded_at TIMESTAMP WITH TIME ZONE
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    color TEXT,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    skill_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create skill_categories junction table
CREATE TABLE IF NOT EXISTS skill_categories (
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (skill_id, category_id)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    github_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    bio TEXT,
    preferred_locale TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (skill_id, user_id)
);

-- Create installations table (anonymous tracking)
CREATE TABLE IF NOT EXISTS installations (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
    platform TEXT NOT NULL,
    method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, skill_id)
);

-- Create indexing_jobs table
CREATE TABLE IF NOT EXISTS indexing_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    skill_id TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create discovered_repos table (for multi-strategy discovery)
CREATE TABLE IF NOT EXISTS discovered_repos (
    id TEXT PRIMARY KEY,  -- owner/repo
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    discovered_via TEXT NOT NULL,  -- 'awesome-list', 'topic-search', 'fork', 'org-scan', 'code-search'
    source_url TEXT,  -- URL or reference to what discovered this repo
    last_scanned TIMESTAMP WITH TIME ZONE,
    skill_count INTEGER DEFAULT 0,
    has_skill_md BOOLEAN DEFAULT FALSE,
    github_stars INTEGER DEFAULT 0,
    github_forks INTEGER DEFAULT 0,
    default_branch TEXT DEFAULT 'main',
    is_archived BOOLEAN DEFAULT FALSE,
    scan_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create awesome_lists table (for tracking curated lists)
CREATE TABLE IF NOT EXISTS awesome_lists (
    id TEXT PRIMARY KEY,  -- owner/repo
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT,
    last_parsed TIMESTAMP WITH TIME ZONE,
    repo_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create removal_requests table (for skill removal requests)
CREATE TABLE IF NOT EXISTS removal_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,  -- Can reference non-existent skill if already removed
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
    verified_owner BOOLEAN DEFAULT FALSE,  -- GitHub API verification result
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by TEXT REFERENCES users(id),
    resolution_note TEXT
);

-- Create add_requests table (for skill addition requests)
CREATE TABLE IF NOT EXISTS add_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,  -- Full GitHub URL
    skill_path TEXT,  -- Optional path within repo (for subfolder skills)
    reason TEXT NOT NULL,  -- Why should this skill be added
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, indexed
    valid_repo BOOLEAN DEFAULT FALSE,  -- GitHub API validation result
    has_skill_md BOOLEAN DEFAULT FALSE,  -- Whether SKILL.md was found
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    indexed_skill_id TEXT,  -- Reference to skill if successfully indexed
    error_message TEXT  -- Error if indexing failed
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(github_owner);
CREATE INDEX IF NOT EXISTS idx_skills_stars ON skills(github_stars DESC);
CREATE INDEX IF NOT EXISTS idx_skills_downloads ON skills(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_skills_security ON skills(security_score DESC);
CREATE INDEX IF NOT EXISTS idx_skills_verified ON skills(is_verified);
CREATE INDEX IF NOT EXISTS idx_skills_featured ON skills(is_featured);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_name_trgm ON skills USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_desc_trgm ON skills USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_skill_categories_skill ON skill_categories(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_categories_category ON skill_categories(category_id);

CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE INDEX IF NOT EXISTS idx_ratings_skill ON ratings(skill_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);

CREATE INDEX IF NOT EXISTS idx_installations_skill ON installations(skill_id);
CREATE INDEX IF NOT EXISTS idx_installations_platform ON installations(platform);
CREATE INDEX IF NOT EXISTS idx_installations_created ON installations(created_at);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_skill ON favorites(skill_id);

CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_type ON indexing_jobs(type);

CREATE INDEX IF NOT EXISTS idx_discovered_repos_owner ON discovered_repos(owner);
CREATE INDEX IF NOT EXISTS idx_discovered_repos_discovered_via ON discovered_repos(discovered_via);
CREATE INDEX IF NOT EXISTS idx_discovered_repos_last_scanned ON discovered_repos(last_scanned);
CREATE INDEX IF NOT EXISTS idx_discovered_repos_skill_count ON discovered_repos(skill_count DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_repos_has_skill_md ON discovered_repos(has_skill_md);

CREATE INDEX IF NOT EXISTS idx_awesome_lists_last_parsed ON awesome_lists(last_parsed);

CREATE INDEX IF NOT EXISTS idx_removal_requests_user ON removal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_removal_requests_skill ON removal_requests(skill_id);
CREATE INDEX IF NOT EXISTS idx_removal_requests_status ON removal_requests(status);

CREATE INDEX IF NOT EXISTS idx_add_requests_user ON add_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_add_requests_status ON add_requests(status);
CREATE INDEX IF NOT EXISTS idx_add_requests_repo ON add_requests(repository_url);

CREATE INDEX IF NOT EXISTS idx_skills_blocked ON skills(is_blocked);

-- Composite indexes for common query patterns (scalability optimization)
-- These optimize filtering + sorting combinations for 5000+ skills
CREATE INDEX IF NOT EXISTS idx_skills_verified_stars ON skills(is_verified, github_stars DESC);
CREATE INDEX IF NOT EXISTS idx_skills_verified_downloads ON skills(is_verified, download_count DESC);
CREATE INDEX IF NOT EXISTS idx_skills_featured_stars ON skills(is_featured, github_stars DESC);

-- Category + sort indexes (via skill_categories join)
CREATE INDEX IF NOT EXISTS idx_skill_categories_cat_skill ON skill_categories(category_id, skill_id);

-- JSON field index for platform filtering
CREATE INDEX IF NOT EXISTS idx_skills_compatibility ON skills USING gin (compatibility);

-- Insert 16 standard categories (v2.0 - February 2026)
-- Based on analysis of 171,509 skills - ordered by expected volume
INSERT INTO categories (id, name, slug, description, icon, color, sort_order, skill_count) VALUES
  -- Tier 1: High volume categories (15-20% each)
  ('cat-ai-llm', 'AI & LLM', 'ai-llm', 'Large language models, Claude, OpenAI, LangChain, RAG, embeddings, and machine learning', 'Brain', '#8B5CF6', 1, 0),
  ('cat-git', 'Git & Version Control', 'git-version-control', 'GitHub, GitLab, branching, merging, pull requests, and repository management', 'GitBranch', '#6366F1', 2, 0),
  ('cat-data', 'Data & Database', 'data-database', 'SQL, NoSQL, PostgreSQL, MongoDB, Redis, ORM, ETL, and data pipelines', 'Database', '#10B981', 3, 0),
  ('cat-backend', 'Backend & APIs', 'backend-apis', 'REST, GraphQL, Express, FastAPI, Django, microservices, and server-side development', 'Server', '#3B82F6', 4, 0),
  -- Tier 2: Medium volume (6-12% each)
  ('cat-frontend', 'Frontend & UI', 'frontend-ui', 'React, Vue, Svelte, CSS, Tailwind, design systems, and component libraries', 'Monitor', '#EC4899', 5, 0),
  ('cat-agents', 'Agents & Orchestration', 'agents-orchestration', 'Multi-agent systems, agentic workflows, autonomous agents, and AI orchestration', 'Bot', '#7C3AED', 6, 0),
  ('cat-testing', 'Testing & QA', 'testing-qa', 'Jest, Cypress, Playwright, TDD, unit tests, debugging, and quality assurance', 'CheckCircle', '#10B981', 7, 0),
  ('cat-devops', 'DevOps & Cloud', 'devops-cloud', 'Docker, Kubernetes, AWS, Azure, GCP, CI/CD, Terraform, and infrastructure', 'Cloud', '#F97316', 8, 0),
  ('cat-languages', 'Programming Languages', 'programming-languages', 'Python, JavaScript, TypeScript, Rust, Go, Java, and language-specific patterns', 'Code', '#14B8A6', 9, 0),
  -- Tier 3: Specialized (2-5% each)
  ('cat-documents', 'Documents & Files', 'documents-files', 'PDF, Word, Excel, PowerPoint, file conversion, OCR, and document processing', 'FileText', '#3B82F6', 10, 0),
  ('cat-security', 'Security & Auth', 'security-auth', 'OAuth, JWT, encryption, authentication, authorization, and vulnerability scanning', 'Shield', '#EF4444', 11, 0),
  ('cat-mcp', 'MCP & Skills', 'mcp-skills', 'Model Context Protocol, skill creation, superpowers, and agent capabilities', 'Layers', '#A855F7', 12, 0),
  ('cat-prompts', 'Prompts & Instructions', 'prompts-instructions', 'Prompt engineering, chain-of-thought, few-shot learning, and instruction design', 'Sparkles', '#FBBF24', 13, 0),
  ('cat-content', 'Content & Writing', 'content-writing', 'Documentation, technical writing, i18n, localization, and content creation', 'PenTool', '#F59E0B', 14, 0),
  ('cat-mobile', 'Mobile Development', 'mobile-development', 'iOS, Android, React Native, Flutter, Expo, and cross-platform mobile apps', 'Smartphone', '#A855F7', 15, 0),
  -- Tier 4: Fallback
  ('cat-other', 'Other & Utilities', 'other-utilities', 'Miscellaneous tools and utilities not fitting other categories', 'Package', '#6B7280', 16, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

-- Full-text search vector column for relevance ranking
-- This provides better search results than trigram matching alone
ALTER TABLE skills ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate search vector for existing rows
UPDATE skills SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(github_owner, '')), 'C')
WHERE search_vector IS NULL;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_skills_search_vector ON skills USING GIN(search_vector);

-- Create function to update search vector on insert/update
CREATE OR REPLACE FUNCTION skills_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.github_owner, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create trigger to keep search_vector updated
DROP TRIGGER IF EXISTS skills_search_update ON skills;
CREATE TRIGGER skills_search_update BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION skills_search_trigger();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create skills-specific function that ignores counter-only and metadata-only updates
-- Without this, every view/download/cache-fill would mark the skill as "updated"
CREATE OR REPLACE FUNCTION update_skills_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Compare only content-related columns; ignore counters, cache, and indexer metadata
    -- Excluded: view_count, download_count, rating*, last_downloaded_at (counters)
    -- Excluded: cached_files (download cache, not content change)
    -- Excluded: indexed_at, last_scanned (indexer bookkeeping)
    -- Excluded: github_stars, github_forks (popularity metrics, not content)
    -- Excluded: quality_score, quality_details, skill_type, is_duplicate, canonical_skill_id, repo_skill_count (curation metadata)
    IF ROW(NEW.name, NEW.description, NEW.github_owner, NEW.github_repo, NEW.skill_path,
           NEW.branch, NEW.commit_sha, NEW.source_format, NEW.version, NEW.license, NEW.author, NEW.homepage,
           NEW.compatibility, NEW.triggers,
           NEW.security_score, NEW.security_status, NEW.is_verified, NEW.is_featured, NEW.is_blocked,
           NEW.content_hash, NEW.raw_content)
       IS NOT DISTINCT FROM
       ROW(OLD.name, OLD.description, OLD.github_owner, OLD.github_repo, OLD.skill_path,
           OLD.branch, OLD.commit_sha, OLD.source_format, OLD.version, OLD.license, OLD.author, OLD.homepage,
           OLD.compatibility, OLD.triggers,
           OLD.security_score, OLD.security_status, OLD.is_verified, OLD.is_featured, OLD.is_blocked,
           OLD.content_hash, OLD.raw_content)
    THEN
        -- No content change, preserve old updated_at
        NEW.updated_at = OLD.updated_at;
    ELSE
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for skills table
DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION update_skills_updated_at_column();

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for ratings table
DROP TRIGGER IF EXISTS update_ratings_updated_at ON ratings;
CREATE TRIGGER update_ratings_updated_at
    BEFORE UPDATE ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for discovered_repos table
DROP TRIGGER IF EXISTS update_discovered_repos_updated_at ON discovered_repos;
CREATE TRIGGER update_discovered_repos_updated_at
    BEFORE UPDATE ON discovered_repos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to update category skill count
CREATE OR REPLACE FUNCTION update_category_skill_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE categories SET skill_count = skill_count + 1 WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE categories SET skill_count = skill_count - 1 WHERE id = OLD.category_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create trigger for skill_categories
DROP TRIGGER IF EXISTS update_category_count ON skill_categories;
CREATE TRIGGER update_category_count
    AFTER INSERT OR DELETE ON skill_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_category_skill_count();

-- Email subscriptions table (newsletter and marketing)
CREATE TABLE IF NOT EXISTS email_subscriptions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,  -- 'oauth', 'newsletter', 'claim', 'early-access'
    marketing_consent BOOLEAN DEFAULT false,
    consent_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    unsubscribed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for email_subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscriptions_email ON email_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_source ON email_subscriptions(source);



-- ============================================================
-- Schema Migrations
-- These ALTER TABLE statements ensure columns added after
-- initial table creation are present on existing databases.
-- (CREATE TABLE IF NOT EXISTS does NOT add new columns)
-- ============================================================

-- Users table migrations
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_locale TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Skills table migrations
ALTER TABLE skills ADD COLUMN IF NOT EXISTS security_status TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS cached_files JSONB;

-- Skills indexes for new columns
CREATE INDEX IF NOT EXISTS idx_skills_security_status ON skills(security_status);
CREATE INDEX IF NOT EXISTS idx_skills_blocked ON skills(is_blocked);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS source_format TEXT DEFAULT 'skill.md';
CREATE INDEX IF NOT EXISTS idx_skills_source_format ON skills(source_format);

-- Add last_downloaded_at column for sorting by recent downloads
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_skills_last_downloaded ON skills(last_downloaded_at DESC NULLS LAST);

-- Curation columns (Phase 2 - February 2026)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS quality_details JSONB;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_type TEXT;  -- 'standalone', 'project-bound', 'collection', 'aggregator'
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS canonical_skill_id TEXT;  -- points to original if duplicate
ALTER TABLE skills ADD COLUMN IF NOT EXISTS repo_skill_count INTEGER;  -- cached count of skills in repo

CREATE INDEX IF NOT EXISTS idx_skills_quality ON skills(quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(skill_type);
CREATE INDEX IF NOT EXISTS idx_skills_duplicate ON skills(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_skills_content_hash ON skills(content_hash);

-- Review pipeline columns (Phase 4+5 - February 2026)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unreviewed';
CREATE INDEX IF NOT EXISTS idx_skills_review_status ON skills(review_status);

-- Repo creation date for duplicate tie-breaking (T074b)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS repo_created_at TIMESTAMP WITH TIME ZONE;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
