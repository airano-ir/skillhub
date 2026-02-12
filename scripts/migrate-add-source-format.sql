-- Migration: Add source_format column to skills table
-- Run: docker exec -i skillhub-db psql -U postgres -d skillhub < scripts/migrate-add-source-format.sql

ALTER TABLE skills ADD COLUMN IF NOT EXISTS source_format TEXT DEFAULT 'skill.md';
CREATE INDEX IF NOT EXISTS idx_skills_source_format ON skills(source_format);
