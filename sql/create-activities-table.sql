-- Activities Table
CREATE TABLE IF NOT EXISTS activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  image_url TEXT,
  emoji VARCHAR(10),
  color VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DIY Kits Table
CREATE TABLE IF NOT EXISTS diy_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_activities_name ON activities(name);
CREATE INDEX IF NOT EXISTS idx_diy_kits_name ON diy_kits(name);
CREATE INDEX IF NOT EXISTS idx_diy_kits_price ON diy_kits(price);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_diy_kits_updated_at BEFORE UPDATE ON diy_kits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

