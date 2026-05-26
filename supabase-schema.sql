-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Login Table (to track login history)
CREATE TABLE IF NOT EXISTS login (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTP Table (to store active OTPs)
CREATE TABLE IF NOT EXISTS otp (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- 'signup' or 'password_reset'
  is_used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp(email, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_is_used ON otp(is_used);
CREATE INDEX IF NOT EXISTS idx_login_user_id ON login(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for otp table
CREATE TRIGGER update_otp_updated_at BEFORE UPDATE ON otp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

