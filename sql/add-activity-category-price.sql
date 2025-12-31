-- Add category and price columns to activities table
-- Category: 'group' or 'individual'
-- Price: DECIMAL for activity pricing

-- Add category column
ALTER TABLE activities 
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'group' CHECK (category IN ('group', 'individual'));

-- Add price column
ALTER TABLE activities 
  ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0;

-- Create index for category
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);

-- Create index for price
CREATE INDEX IF NOT EXISTS idx_activities_price ON activities(price);

