-- Migration: Add skill management features (is_blocked, add_requests table)
-- Run this on existing databases to add the new columns and tables

-- Add is_blocked column to skills table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'skills' AND column_name = 'is_blocked'
    ) THEN
        ALTER TABLE skills ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_skills_blocked ON skills(is_blocked);
        RAISE NOTICE 'Added is_blocked column to skills table';
    ELSE
        RAISE NOTICE 'is_blocked column already exists';
    END IF;
END $$;

-- Create add_requests table (if not exists)
CREATE TABLE IF NOT EXISTS add_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository_url TEXT NOT NULL,
    skill_path TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    valid_repo BOOLEAN DEFAULT FALSE,
    has_skill_md BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    indexed_skill_id TEXT,
    error_message TEXT
);

-- Create indexes for add_requests (if not exists)
CREATE INDEX IF NOT EXISTS idx_add_requests_user ON add_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_add_requests_status ON add_requests(status);
CREATE INDEX IF NOT EXISTS idx_add_requests_repo ON add_requests(repository_url);

-- Verify the changes
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully';
END $$;
