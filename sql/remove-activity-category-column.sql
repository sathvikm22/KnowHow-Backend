-- Remove category column from activities table
-- Run this in Supabase SQL Editor after backing up if needed.

-- Drop the index on category (if it exists)
DROP INDEX IF EXISTS idx_activities_category;

-- Drop the category column
ALTER TABLE activities DROP COLUMN IF EXISTS category;
