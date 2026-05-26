-- ====================================================
-- PAYMENT SYSTEM SCHEMA FOR KNOW HOW CAFE
-- ====================================================
-- This schema supports Razorpay Standard Checkout integration
-- Orders table: Stores data BEFORE payment (when order is created)
-- Payments table: Stores data AFTER payment success

-- ====================================================
-- ORDERS TABLE (Data BEFORE payment)
-- ====================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Internal tracking
  internal_bill_id TEXT UNIQUE NOT NULL,
  session_user_id TEXT, -- Logged in user's ID from users table
  
  -- Razorpay order details (created when opening checkout)
  razorpay_order_id TEXT UNIQUE,
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
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for orders table
CREATE INDEX IF NOT EXISTS idx_orders_internal_bill_id ON orders(internal_bill_id);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_user_id ON orders(session_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- ====================================================
-- PAYMENTS TABLE (Data AFTER payment success)
-- ====================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Razorpay payment identifiers
  razorpay_payment_id TEXT UNIQUE NOT NULL,
  razorpay_order_id TEXT NOT NULL,
  razorpay_signature TEXT NOT NULL, -- For signature verification
  
  -- Link to order
  internal_bill_id TEXT NOT NULL,
  
  -- Payment amount details
  amount INTEGER NOT NULL, -- Amount in paise
  currency TEXT DEFAULT 'INR',
  
  -- Payment status
  status TEXT NOT NULL DEFAULT 'paid',
  -- Possible values: 'paid', 'failed', 'refunded', 'partially_refunded'
  
  -- Payment method
  method TEXT NOT NULL,
  -- Possible values: 'card', 'upi', 'netbanking', 'wallet', 'emi'
  
  -- Customer contact from Razorpay
  email TEXT,
  contact TEXT,
  
  -- ============================================
  -- CARD-SPECIFIC FIELDS (if method = 'card')
  -- ============================================
  card_last4 TEXT, -- Last 4 digits of card
  card_network TEXT, -- 'Visa', 'MasterCard', 'RuPay', 'Amex', etc.
  card_type TEXT, -- 'credit', 'debit', 'prepaid'
  card_issuer TEXT, -- Bank name (e.g., 'HDFC', 'ICICI')
  
  -- ============================================
  -- UPI-SPECIFIC FIELDS (if method = 'upi')
  -- ============================================
  upi_vpa TEXT, -- Customer UPI ID (e.g., 'user@paytm')
  upi_flow TEXT, -- 'collect' or 'intent'
  bank_transaction_id TEXT, -- Bank transaction reference
  
  -- ============================================
  -- NETBANKING FIELDS (if method = 'netbanking')
  -- ============================================
  bank TEXT, -- Bank name (e.g., 'HDFC', 'ICICI')
  account_type TEXT, -- 'savings', 'current' (if provided)
  
  -- ============================================
  -- WALLET FIELDS (if method = 'wallet')
  -- ============================================
  wallet_name TEXT, -- 'Paytm', 'PhonePe', 'Amazon Pay', etc.
  wallet_transaction_id TEXT,
  
  -- ============================================
  -- REFUND FIELDS (for future use)
  -- ============================================
  refund_status TEXT DEFAULT 'never',
  -- Possible values: 'never', 'partial', 'full'
  refund_amount INTEGER DEFAULT 0, -- Total refunded amount in paise
  refund_ids TEXT[], -- Array of Razorpay refund IDs
  
  -- Order items (snapshot at time of payment)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Additional metadata
  device_info TEXT, -- User agent string
  ip_address TEXT, -- Client IP address
  bill_pdf_url TEXT, -- URL to generated PDF receipt (if stored in cloud)
  
  -- Timestamps
  paid_at TIMESTAMP WITH TIME ZONE, -- When payment was completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payments table
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_internal_bill_id ON payments(internal_bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);

-- Foreign key constraint
ALTER TABLE payments 
ADD CONSTRAINT fk_payments_order 
FOREIGN KEY (razorpay_order_id) 
REFERENCES orders(razorpay_order_id) 
ON DELETE RESTRICT;

-- ====================================================
-- HELPER FUNCTIONS
-- ====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES (Optional)
-- ====================================================
-- Enable RLS if you want users to only see their own orders
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Example policy: Users can only see their own orders
-- CREATE POLICY "Users can view own orders" ON orders
--   FOR SELECT USING (session_user_id = current_setting('app.user_id', true));

-- ====================================================
-- NOTES ON RAZORPAY FIELDS
-- ====================================================
-- 
-- ALWAYS RETURNED BY RAZORPAY:
-- - razorpay_payment_id
-- - razorpay_order_id
-- - razorpay_signature
-- - amount
-- - currency
-- - status
-- - method
-- - email
-- - contact
-- - created_at
--
-- CARD PAYMENTS ONLY:
-- - card_last4
-- - card_network
-- - card_type
-- - card_issuer
--
-- UPI PAYMENTS ONLY:
-- - upi_vpa
-- - upi_flow
-- - bank_transaction_id (from payment.fetch() API)
--
-- NETBANKING ONLY:
-- - bank
-- - account_type (sometimes)
--
-- WALLET PAYMENTS ONLY:
-- - wallet_name
-- - wallet_transaction_id
--
-- ====================================================
-- INTERNAL_BILL_ID GENERATION BEST PRACTICE
-- ====================================================
-- Format: KH-YYYYMMDD-HHMMSS-XXXX
-- Example: KH-20250125-143022-A1B2
-- 
-- This ensures:
-- 1. Uniqueness
-- 2. Human-readable
-- 3. Sortable by date
-- 4. Includes business prefix (KH = Know How)
--
-- Implementation in backend:
-- const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
-- const random = Math.random().toString(36).substring(2, 6).toUpperCase();
-- const internalBillId = `KH-${timestamp}-${random}`;
--
-- ====================================================
-- PDF RECEIPT STORAGE BEST PRACTICE
-- ====================================================
-- Option 1: Store in Supabase Storage
-- - Create a 'receipts' bucket
-- - Upload PDF after generation
-- - Store URL in bill_pdf_url field
--
-- Option 2: Store in cloud storage (AWS S3, Cloudinary)
-- - Upload PDF to cloud storage
-- - Store public URL in bill_pdf_url field
--
-- Option 3: Generate on-demand (current implementation)
-- - Don't store PDF, generate when user requests
-- - bill_pdf_url can be null
--
-- ====================================================

