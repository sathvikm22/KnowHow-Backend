import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Initialize Razorpay (only if keys are provided)
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  console.log('✅ Razorpay initialized successfully for orders');
} else {
  console.log('⚠️  Razorpay not configured for orders - API keys missing.');
}

// Helper function to check if Razorpay is configured
const isRazorpayConfigured = () => {
  if (!razorpay) {
    return false;
  }
  return true;
};

// Create order for DIY kits
router.post('/create-diy-order', async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { amount, orderData } = req.body;

    if (!amount || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Amount and order data are required'
      });
    }

    const {
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      items,
      subtotal,
      totalAmount
    } = orderData;

    if (!customerName || !customerEmail || !customerPhone || !customerAddress || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required order details'
      });
    }

    // Get user ID from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    let userEmail = customerEmail;

    if (token) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        userId = decoded.userId;
        userEmail = decoded.email || customerEmail;
      } catch (err) {
        console.log('Token verification failed, proceeding without user ID');
      }
    }

    // Convert amount to paise
    const amountInPaise = Math.round(amount * 100);

    // Generate receipt ID
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const receiptId = `KH-${timestamp}-${random}`;

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type: 'diy_kit'
      }
    });

    // Save order to database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        internal_bill_id: receiptId,
        session_user_id: userId,
        razorpay_order_id: razorpayOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        receipt: receiptId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        items: items,
        subtotal: Math.round(subtotal * 100), // Convert to paise
        gst: 0, // No GST for now
        total_amount: amountInPaise,
        status: 'created',
        delivery_status: 'order_confirmed',
        notes: 'DIY Kit Order'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error saving order:', orderError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save order'
      });
    }

    res.json({
      success: true,
      data: {
        order_id: razorpayOrder.id,
        amount: amount,
        currency: 'INR',
        receipt: receiptId
      }
    });
  } catch (error) {
    console.error('Error creating DIY order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create order'
    });
  }
});

// Verify DIY order payment
router.post('/verify-diy-payment', async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment details'
      });
    }

    // Verify signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update order in database
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature,
        status: payment.status === 'captured' ? 'paid' : 'failed',
        payment_method: payment.method
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating order:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update order'
      });
    }

    // Save payment details
    if (payment.status === 'captured') {
      await supabase
        .from('payments')
        .insert({
          razorpay_payment_id: payment.id,
          razorpay_order_id: razorpay_order_id,
          razorpay_signature: razorpay_signature,
          internal_bill_id: order.internal_bill_id,
          amount: payment.amount,
          currency: payment.currency,
          status: 'paid',
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          items: order.items,
          paid_at: new Date().toISOString()
        });
    }

    res.json({
      success: true,
      payment_status: payment.status === 'captured' ? 'paid' : 'failed',
      order: order
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify payment'
    });
  }
});

// Get user DIY orders
router.get('/my-diy-orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    let userEmail = null;

    if (token) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        userId = decoded.userId;
        userEmail = decoded.email;
      } catch (err) {
        console.log('Token verification failed');
      }
    }

    if (!userId && !userEmail) {
      userEmail = req.query.email;
    }

    if (!userId && !userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    let query = supabase
      .from('orders')
      .select('*')
      .eq('status', 'paid')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('session_user_id', userId);
    } else if (userEmail) {
      query = query.eq('customer_email', userEmail);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch orders'
      });
    }

    res.json({
      success: true,
      orders: orders || []
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch orders'
    });
  }
});

// Get all DIY orders (admin)
router.get('/all-diy-orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      // Get user to check if admin
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', decoded.userId)
        .maybeSingle();

      if (userError || !user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      // Check if admin (knowhowcafe2025@gmail.com)
      const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';
      if (!isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required' 
        });
      }

      // Get all orders
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'paid')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch orders'
        });
      }

      res.json({
        success: true,
        orders: orders || []
      });
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch orders'
    });
  }
});

// Check DIY order payment status
router.get('/check-diy-payment-status/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', order_id)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: {
        payment_status: order.status === 'paid' ? 'paid' : order.status,
        order: order
      },
      payment_status: order.status === 'paid' ? 'paid' : order.status,
      order: order
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check payment status'
    });
  }
});

// Update delivery status (admin)
router.post('/update-delivery-status/:order_id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      // Get user to check if admin
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', decoded.userId)
        .maybeSingle();

      if (userError || !user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      // Check if admin (knowhowcafe2025@gmail.com)
      const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';
      if (!isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required' 
        });
      }

      const { order_id } = req.params;
      const { delivery_status, delivery_time } = req.body;

      if (!delivery_status) {
        return res.status(400).json({
          success: false,
          message: 'Delivery status is required'
        });
      }

      const updateData = {
        delivery_status,
        delivery_status_updated_at: new Date().toISOString()
      };

      if (delivery_time) {
        updateData.delivery_time = delivery_time;
      }

      const { data: order, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order_id)
        .select()
        .single();

      if (error) {
        console.error('Error updating delivery status:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update delivery status'
        });
      }

      res.json({
        success: true,
        message: 'Delivery status updated successfully',
        order: order
      });
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update delivery status'
    });
  }
});

export default router;

