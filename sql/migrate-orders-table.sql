-- ====================================================
-- MIGRATION: Clean up orders table for DIY kits only
-- ====================================================
-- This script removes booking-related fields from orders table
-- and ensures it only stores DIY kit orders

-- Step 1: Remove booking-related columns (if they exist)
ALTER TABLE orders 
DROP COLUMN IF EXISTS booking_date,
DROP COLUMN IF EXISTS booking_time_slot,
DROP COLUMN IF EXISTS selected_activities;

-- Step 2: Ensure delivery fields exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'order_confirmed',
ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(50),
ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Step 3: Update session_user_id to be UUID type (if it's TEXT)
-- First check if column exists and what type it is
-- If it's TEXT, we'll need to convert it
DO $$
BEGIN
  -- Check if session_user_id is TEXT and needs conversion
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
    AND column_name = 'session_user_id' 
    AND data_type = 'text'
  ) THEN
    -- Convert TEXT UUIDs to UUID type
    ALTER TABLE orders 
    ALTER COLUMN session_user_id TYPE UUID USING session_user_id::UUID;
    
    -- Add foreign key constraint
    ALTER TABLE orders 
    ADD CONSTRAINT fk_orders_user_id 
    FOREIGN KEY (session_user_id) 
    REFERENCES users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Step 4: Create/update indexes
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id ON orders(razorpay_payment_id);

-- Step 5: Add comments
COMMENT ON COLUMN orders.delivery_status IS 'Delivery status: order_confirmed, on_the_way, delivered, pending_approval';
COMMENT ON COLUMN orders.delivery_time IS 'Expected delivery time: 1-2 days, 4-5 days, within a week, 1-2 weeks, 2-3 weeks, more than 3 weeks';
COMMENT ON TABLE orders IS 'Stores DIY kit orders only (bookings are in separate bookings table)';

