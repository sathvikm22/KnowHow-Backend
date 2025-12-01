-- ====================================================
-- PAYMENTS TABLE FOR CASHFREE INTEGRATION
-- ====================================================
-- This schema stores payment details AFTER payment success
-- Run this SQL in Supabase SQL Editor to create/update the payments table

-- Drop existing table if you want to recreate (CAUTION: This will delete all data)
-- DROP TABLE IF EXISTS payments CASCADE;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cashfree payment identifiers
  cashfree_payment_id TEXT UNIQUE NOT NULL,
  cashfree_order_id TEXT NOT NULL,
  
  -- Link to order/booking
  internal_bill_id TEXT NOT NULL,
  order_type TEXT NOT NULL, -- 'booking' or 'diy'
  
  -- Payment amount details
  amount INTEGER NOT NULL, -- Amount in paise
  currency TEXT DEFAULT 'INR',
  
  -- Payment status
  status TEXT NOT NULL DEFAULT 'paid',
  -- Possible values: 'paid', 'failed', 'refunded', 'partially_refunded'
  
  -- Payment method
  method TEXT NOT NULL,
  -- Possible values: 'card', 'upi', 'netbanking', 'wallet', 'emi', etc.
  
  -- Customer contact from Cashfree
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
  -- REFUND FIELDS (for bookings only)
  -- ============================================
  refund_status TEXT DEFAULT 'never',
  -- Possible values: 'never', 'partial', 'full'
  refund_amount INTEGER DEFAULT 0, -- Total refunded amount in paise
  refund_ids TEXT[], -- Array of Cashfree refund IDs
  
  -- Order items (snapshot at time of payment)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Complete Cashfree payment data (stored as JSONB for all details)
  cashfree_payment_data JSONB, -- Stores complete payment response from Cashfree
  
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
CREATE INDEX IF NOT EXISTS idx_payments_cashfree_payment_id ON payments(cashfree_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_cashfree_order_id ON payments(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_internal_bill_id ON payments(internal_bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payments_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE payments IS 'Stores payment details after successful Cashfree payment';
COMMENT ON COLUMN payments.cashfree_payment_id IS 'Cashfree payment ID';
COMMENT ON COLUMN payments.cashfree_order_id IS 'Cashfree order ID';
COMMENT ON COLUMN payments.cashfree_payment_data IS 'Complete payment data from Cashfree (JSONB format)';
COMMENT ON COLUMN payments.order_type IS 'Type of order: booking (slots) or diy (kits)';
