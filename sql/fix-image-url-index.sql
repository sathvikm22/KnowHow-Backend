-- Fix image_url index to handle long URLs
-- The index was causing errors when trying to store long URLs
-- Remove the index on image_url since we don't need to index it (we search by name, not URL)

-- Drop the problematic indexes
DROP INDEX IF EXISTS idx_activities_image_url;
DROP INDEX IF EXISTS idx_diy_kits_image_url;

-- Note: We don't need to recreate these indexes because:
-- 1. We search activities/kits by name, not by image_url
-- 2. Indexing long URLs (which can be very long) is not efficient
-- 3. The TEXT column can store URLs of any length without indexing

