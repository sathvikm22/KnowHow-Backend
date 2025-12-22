-- Create or update admin user in Supabase
-- Run this in Supabase SQL Editor if you prefer SQL over the Node.js script

-- First, check if admin exists and delete if needed (optional - for clean setup)
-- DELETE FROM users WHERE email = 'knowhowcafe2025@gmail.com';

-- Insert admin user (password is 'password' hashed with bcrypt)
-- Note: You'll need to hash the password first using bcrypt
-- For now, use the Node.js script (npm run create-admin) which handles hashing automatically

-- Alternative: If you want to create via SQL, you need to hash 'password' first
-- You can use an online bcrypt generator or the Node.js script
-- Example hash for 'password' (salt rounds 10): $2a$10$rOzJqZqZqZqZqZqZqZqZqOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ

-- Recommended: Use the Node.js script instead
-- Run: npm run create-admin

