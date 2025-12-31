-- ====================================================
-- COMPLETE ACTIVITY UPDATE SCRIPT
-- ====================================================
-- This script adds category and price columns to activities table
-- and updates existing activities with their correct categories
-- Run this in Supabase SQL Editor

-- Step 1: Add category and price columns to activities table
ALTER TABLE activities 
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'group' CHECK (category IN ('group', 'individual'));

ALTER TABLE activities 
  ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0;

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
CREATE INDEX IF NOT EXISTS idx_activities_price ON activities(price);

-- Step 3: Update existing activities with their category
-- Group activities: Noted, Protector, Plushie heaven, Magnetic world, Retro Writes
UPDATE activities 
SET category = 'group'
WHERE name IN ('Noted', 'Protector', 'Plushie heaven', 'Magnetic world', 'Retro Writes');

-- Individual activities: Jewelry Making, Tufting Experience
-- Using case-insensitive matching to handle variations
UPDATE activities 
SET category = 'individual'
WHERE LOWER(name) LIKE '%jewelry%' 
   OR LOWER(name) LIKE '%jewellery%'
   OR LOWER(name) LIKE '%tufting%';

-- Set default category for any remaining activities
UPDATE activities 
SET category = 'group'
WHERE category IS NULL;

-- Step 4: Verify the updates
SELECT name, category, price 
FROM activities 
ORDER BY category, name;

