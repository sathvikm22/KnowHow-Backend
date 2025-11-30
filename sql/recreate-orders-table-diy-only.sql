-- ====================================================
-- CLEAN ORDERS TABLE FOR DIY KITS ONLY
-- ====================================================
-- This table stores ONLY DIY kit orders (not bookings)
-- Bookings are stored in the separate 'bookings' table

-- Drop existing orders table if you want to start fresh
-- WARNING: This will delete all existing orders data!
-- DROP TABLE IF EXISTS orders CASCADE;

-- Create clean orders table for DIY kits
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Internal tracking
  internal_bill_id TEXT UNIQUE NOT NULL,
  session_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Razorpay order details
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount INTEGER NOT NULL, -- Amount in paise (e.g., 10000 = ₹100.00)
  currency TEXT DEFAULT 'INR',
  receipt TEXT,
  
  -- Customer information (for delivery)
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  
  -- Order items (DIY kits - stored as JSONB)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Example structure:
  -- [
  --   {
  --     "name": "DIY Kit Name",
  --     "quantity": 2,
  --     "unit_price": 50000,  -- in paise
  --     "total": 100000       -- in paise
  --   }
  -- ]
  
  -- Financial breakdown
  subtotal INTEGER NOT NULL, -- In paise
  gst INTEGER DEFAULT 0, -- GST amount in paise (0 for now)
  total_amount INTEGER NOT NULL, -- Total in paise (subtotal + gst)
  
  -- Payment status
  status TEXT NOT NULL DEFAULT 'created',
  -- Possible values: 'created', 'paid', 'failed', 'expired', 'cancelled'
  payment_method TEXT, -- 'card', 'upi', 'netbanking', 'wallet', etc.
  
  -- Delivery tracking
  delivery_status VARCHAR(50) DEFAULT 'order_confirmed',
  -- Possible values: 'order_confirmed', 'on_the_way', 'delivered', 'pending_approval'
  delivery_time VARCHAR(50),
  -- Possible values: '1-2 days', '4-5 days', 'within a week', '1-2 weeks', '2-3 weeks', 'more than 3 weeks'
  delivery_status_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Additional details
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop old indexes if they exist
DROP INDEX IF EXISTS idx_orders_internal_bill_id;
DROP INDEX IF EXISTS idx_orders_razorpay_order_id;
DROP INDEX IF EXISTS idx_orders_session_user_id;
DROP INDEX IF EXISTS idx_orders_customer_email;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_created_at;
DROP INDEX IF EXISTS idx_orders_delivery_status;

-- Create indexes for better performance
CREATE INDEX idx_orders_internal_bill_id ON orders(internal_bill_id);
CREATE INDEX idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX idx_orders_razorpay_payment_id ON orders(razorpay_payment_id);
CREATE INDEX idx_orders_session_user_id ON orders(session_user_id);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_delivery_status ON orders(delivery_status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;

-- Create trigger for orders table
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- Add comments
COMMENT ON TABLE orders IS 'Stores DIY kit orders only (not bookings)';
COMMENT ON COLUMN orders.delivery_status IS 'Delivery status: order_confirmed, on_the_way, delivered, pending_approval';
COMMENT ON COLUMN orders.delivery_time IS 'Expected delivery time: 1-2 days, 4-5 days, within a week, 1-2 weeks, 2-3 weeks, more than 3 weeks';
COMMENT ON COLUMN orders.items IS 'JSONB array of DIY kit items with name, quantity, unit_price, total';
COMMENT ON COLUMN orders.amount IS 'Amount in paise (divide by 100 for rupees)';

