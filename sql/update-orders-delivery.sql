-- Add delivery status and delivery time fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'order_confirmed',
ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(50),
ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMP WITH TIME ZONE;

-- Update delivery_status constraint
-- Possible values: 'order_confirmed', 'on_the_way', 'delivered', 'pending_approval'
-- delivery_time values: '1-2 days', '4-5 days', 'within a week', '1-2 weeks', etc.

-- Create index for delivery status
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);

-- Add comment
COMMENT ON COLUMN orders.delivery_status IS 'Delivery status: order_confirmed, on_the_way, delivered, pending_approval';
COMMENT ON COLUMN orders.delivery_time IS 'Expected delivery time: 1-2 days, 4-5 days, within a week, etc.';

