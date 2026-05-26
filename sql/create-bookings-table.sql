-- Bookings/Slots Table
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
  razorpay_order_id VARCHAR(255) UNIQUE,
  razorpay_payment_id VARCHAR(255),
  razorpay_signature VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  payment_status VARCHAR(50) DEFAULT 'pending_payment', -- pending_payment, paid, failed, refunded, cancelled
  payment_method VARCHAR(50),
  
  -- Refund details
  refund_id VARCHAR(255),
  refund_status VARCHAR(50), -- initiated, processed, failed
  refund_amount DECIMAL(10, 2),
  refund_reason TEXT,
  refund_initiated_at TIMESTAMP WITH TIME ZONE,
  refund_processed_at TIMESTAMP WITH TIME ZONE,
  
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
CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_order_id ON bookings(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_payment_id ON bookings(razorpay_payment_id);
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

