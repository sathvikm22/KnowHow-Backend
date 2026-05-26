-- ====================================================
-- ADD CASHFREE COLUMNS TO DATABASE TABLES
-- ====================================================
-- Run this SQL in Supabase SQL Editor to add Cashfree payment columns
-- This is required for Cashfree integration

-- ====================================================
-- BOOKINGS TABLE
-- ====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(255);

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cashfree_payment_id VARCHAR(255);

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cashfree_payment_session_id VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_cashfree_order_id ON bookings(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cashfree_payment_id ON bookings(cashfree_payment_id);

-- ====================================================
-- ORDERS TABLE (DIY Orders)
-- ====================================================
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(255);

ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS cashfree_payment_id VARCHAR(255);

ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS cashfree_payment_session_id VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_cashfree_order_id ON orders(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashfree_payment_id ON orders(cashfree_payment_id);

-- ====================================================
-- PAYMENTS TABLE
-- ====================================================
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS cashfree_payment_id VARCHAR(255);

ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_cashfree_payment_id ON payments(cashfree_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_cashfree_order_id ON payments(cashfree_order_id);

-- ====================================================
-- COMMENTS
-- ====================================================
COMMENT ON COLUMN bookings.cashfree_order_id IS 'Cashfree order ID for payment tracking';
COMMENT ON COLUMN bookings.cashfree_payment_id IS 'Cashfree payment ID after successful payment';
COMMENT ON COLUMN bookings.cashfree_payment_session_id IS 'Cashfree payment session ID for redirecting to payment page';

COMMENT ON COLUMN orders.cashfree_order_id IS 'Cashfree order ID for payment tracking';
COMMENT ON COLUMN orders.cashfree_payment_id IS 'Cashfree payment ID after successful payment';
COMMENT ON COLUMN orders.cashfree_payment_session_id IS 'Cashfree payment session ID for redirecting to payment page';

COMMENT ON COLUMN payments.cashfree_payment_id IS 'Cashfree payment ID';
COMMENT ON COLUMN payments.cashfree_order_id IS 'Cashfree order ID';
