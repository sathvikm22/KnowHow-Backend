-- ====================================================
-- ORDERS TABLE FOR CASHFREE INTEGRATION (DIY KITS)
-- ====================================================
-- This schema supports Cashfree payment integration for DIY kit orders
-- Run this SQL in Supabase SQL Editor to create/update the orders table
-- If you have existing data, you can manually delete the old table and run this

-- Drop existing table if you want to recreate (CAUTION: This will delete all data)
-- DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Internal tracking
  internal_bill_id TEXT UNIQUE NOT NULL,
  session_user_id TEXT, -- Logged in user's ID from users table
  
  -- Cashfree order details (created when opening checkout)
  cashfree_order_id TEXT UNIQUE,
  cashfree_payment_session_id TEXT,
  amount INTEGER NOT NULL, -- Amount in paise (e.g., 10000 = ₹100.00)
  currency TEXT DEFAULT 'INR',
  receipt TEXT, -- Usually same as internal_bill_id
  
  -- Customer information
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  
  -- Order items (stored as JSONB for flexibility)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Example structure:
  -- [
  --   {
  --     "name": "Jewellery Lab",
  --     "quantity": 1,
  --     "unit_price": 2499,
  --     "total": 2499
  --   }
  -- ]
  
  -- Financial breakdown
  subtotal INTEGER NOT NULL, -- In paise
  gst INTEGER NOT NULL, -- GST amount in paise
  total_amount INTEGER NOT NULL, -- Total in paise (subtotal + gst)
  
  -- Additional details
  notes TEXT, -- Order notes, special instructions
  booking_date DATE,
  booking_time_slot TEXT,
  selected_activities TEXT[], -- Array of activity names
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'created', 
  -- Possible values: 'created', 'paid', 'failed', 'expired', 'cancelled'
  
  -- Payment method (from Cashfree)
  payment_method TEXT,
  
  -- Additional Cashfree payment data (stored as JSONB for flexibility)
  cashfree_payment_data JSONB, -- Stores all payment details from Cashfree webhook/API
  
  -- Delivery tracking (for DIY kits)
  delivery_status TEXT DEFAULT 'order_confirmed',
  -- Possible values: 'order_confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'
  delivery_status_updated_at TIMESTAMP WITH TIME ZONE,
  delivery_time TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for orders table
CREATE INDEX IF NOT EXISTS idx_orders_internal_bill_id ON orders(internal_bill_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashfree_order_id ON orders(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_user_id ON orders(session_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_orders_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE orders IS 'Stores DIY kit orders with Cashfree payment integration';
COMMENT ON COLUMN orders.cashfree_order_id IS 'Cashfree order ID for payment tracking';
COMMENT ON COLUMN orders.cashfree_payment_session_id IS 'Cashfree payment session ID for redirecting to payment page';
COMMENT ON COLUMN orders.cashfree_payment_data IS 'Complete payment data from Cashfree (JSONB format)';
COMMENT ON COLUMN orders.delivery_status IS 'Delivery status for DIY kit orders (refunds not supported for DIY orders)';
