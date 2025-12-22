-- Know How Cafe - Database Setup Script
-- Run this script in your Supabase SQL Editor

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: login_logs
CREATE TABLE IF NOT EXISTS login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  login_time TIMESTAMP DEFAULT NOW(),
  method TEXT NOT NULL
);

-- Table: otps
CREATE TABLE IF NOT EXISTS otps (
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  type TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (email, type)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(email);
CREATE INDEX IF NOT EXISTS idx_otps_email_type ON otps(email, type);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);

-- Add comments for documentation
COMMENT ON TABLE users IS 'Stores user account information';
COMMENT ON TABLE login_logs IS 'Logs user login attempts';
COMMENT ON TABLE otps IS 'Stores OTP codes for email verification and password reset';

