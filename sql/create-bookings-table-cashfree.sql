-- ====================================================
-- BOOKINGS TABLE FOR CASHFREE INTEGRATION
-- ====================================================
-- This schema supports Cashfree payment integration
-- Run this SQL in Supabase SQL Editor to create/update the bookings table
-- If you have existing data, you can manually delete the old table and run this

-- Drop existing table if you want to recreate (CAUTION: This will delete all data)
-- DROP TABLE IF EXISTS bookings CASCADE;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_phone VARCHAR(50) NOT NULL,
  user_address TEXT,
  
  -- Booking details
  activity_name VARCHAR(255) NOT NULL,
  combo_name VARCHAR(255),
  selected_activities TEXT[], -- Array of activity names
  booking_date DATE NOT NULL,
  booking_time_slot VARCHAR(50) NOT NULL,
  participants INTEGER DEFAULT 1,
  
  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  payment_status VARCHAR(50) DEFAULT 'pending_payment', -- pending_payment, paid, failed, refunded, cancelled
  payment_method VARCHAR(50),
  
  -- Cashfree payment identifiers
  cashfree_order_id VARCHAR(255) UNIQUE,
  cashfree_payment_id VARCHAR(255),
  cashfree_payment_session_id VARCHAR(255),
  
  -- Additional Cashfree payment data (stored as JSONB for flexibility)
  cashfree_payment_data JSONB, -- Stores all payment details from Cashfree webhook/API
  
  -- Refund details (only for bookings, not DIY orders)
  refund_id VARCHAR(255),
  refund_status VARCHAR(50), -- initiated, processed, failed
  refund_amount DECIMAL(10, 2),
  refund_reason TEXT,
  refund_initiated_at TIMESTAMP WITH TIME ZONE,
  refund_processed_at TIMESTAMP WITH TIME ZONE,
  cashfree_refund_data JSONB, -- Stores refund details from Cashfree
  
  -- Booking status
  status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  is_updated BOOLEAN DEFAULT FALSE,
  original_booking_date DATE,
  original_booking_time_slot VARCHAR(50),
  updated_booking_date DATE,
  updated_booking_time_slot VARCHAR(50),
  updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  internal_bill_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_email ON bookings(user_email);
CREATE INDEX IF NOT EXISTS idx_bookings_cashfree_order_id ON bookings(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cashfree_payment_id ON bookings(cashfree_payment_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_time_slot ON bookings(booking_time_slot);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for bookings table
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_bookings_updated_at();

-- Comments for documentation
COMMENT ON TABLE bookings IS 'Stores slot booking information with Cashfree payment integration';
COMMENT ON COLUMN bookings.cashfree_order_id IS 'Cashfree order ID for payment tracking';
COMMENT ON COLUMN bookings.cashfree_payment_id IS 'Cashfree payment ID after successful payment';
COMMENT ON COLUMN bookings.cashfree_payment_session_id IS 'Cashfree payment session ID for redirecting to payment page';
COMMENT ON COLUMN bookings.cashfree_payment_data IS 'Complete payment data from Cashfree (JSONB format)';
COMMENT ON COLUMN bookings.cashfree_refund_data IS 'Complete refund data from Cashfree (JSONB format)';
