-- Add cookie consent columns to users table
-- Run this in your Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS cookie_consent VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cookie_consent_date TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.cookie_consent IS 'User cookie consent status: NULL (never asked), accepted, or declined';
COMMENT ON COLUMN users.cookie_consent_date IS 'Date when user last updated their cookie consent';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_cookie_consent ON users(cookie_consent);

