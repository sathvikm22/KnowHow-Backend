-- Remove emoji and color columns from activities table
-- Run this in Supabase SQL Editor

ALTER TABLE activities DROP COLUMN IF EXISTS emoji;
ALTER TABLE activities DROP COLUMN IF EXISTS color;

