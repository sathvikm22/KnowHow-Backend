-- Update Activities and DIY Kits Tables Schema
-- Run this in Supabase SQL Editor to ensure proper image_url handling

-- Ensure activities table has correct structure
ALTER TABLE activities 
  DROP COLUMN IF EXISTS emoji,
  DROP COLUMN IF EXISTS color;

-- Ensure image_url column exists and is TEXT type (can store long URLs)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE activities ADD COLUMN image_url TEXT;
  ELSE
    ALTER TABLE activities ALTER COLUMN image_url TYPE TEXT;
  END IF;
END $$;

-- Ensure diy_kits table has correct structure
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'diy_kits' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE diy_kits ADD COLUMN image_url TEXT;
  ELSE
    ALTER TABLE diy_kits ALTER COLUMN image_url TYPE TEXT;
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_activities_image_url ON activities(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diy_kits_image_url ON diy_kits(image_url) WHERE image_url IS NOT NULL;

