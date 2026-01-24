import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { verifyAccessToken } from '../utils/generateToken.js';

const router = express.Router();

// Cashfree Configuration (shared with payments.js)
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_MODE = process.env.CASHFREE_MODE || 'production';
const CASHFREE_API_URL = CASHFREE_MODE === 'production' 
  ? 'https://api.cashfree.com/pg' 
  : 'https://sandbox.cashfree.com/pg';

// Helper function to check if Cashfree is configured
const isCashfreeConfigured = () => {
  if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
    return false;
  }
  return true;
};

// Helper function to get Cashfree headers
const getCashfreeHeaders = () => {
  return {
    'x-client-id': CASHFREE_APP_ID,
    'x-client-secret': CASHFREE_SECRET_KEY,
    'x-api-version': '2023-08-01',
    'Content-Type': 'application/json'
  };
};

// Initialize Cashfree
if (isCashfreeConfigured()) {
  console.log('✅ Cashfree initialized successfully for orders');
  console.log('   Mode:', CASHFREE_MODE);
} else {
  console.log('⚠️  Cashfree not configured for orders - API keys missing.');
}

// Create order for DIY kits
router.post('/create-diy-order', async (req, res) => {
  try {
    if (!isCashfreeConfigured()) {
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

    // Generate order ID
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderId = `KH-DIY-${timestamp}-${random}`;

    // Get frontend URL for return URLs
    // Cashfree requires HTTPS URLs, so use production URL even in development
    let frontendUrl = process.env.FRONTEND_URL || 'https://www.knowhowindia.in';
    
    // If localhost is detected, use production URL for Cashfree (they require HTTPS)
    if (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) {
      console.log('⚠️  Localhost detected, using production URL for Cashfree return_url (HTTPS required)');
      frontendUrl = 'https://www.knowhowindia.in';
    }
    
    // Ensure HTTPS
    if (!frontendUrl.startsWith('https://')) {
      frontendUrl = frontendUrl.replace(/^http:\/\//, 'https://');
    }
    
    const returnUrl = `${frontendUrl}/payment-processing?order_id=${orderId}&type=diy`;
    
    // Backend URL for webhook (also needs HTTPS in production)
    let backendUrl = process.env.BACKEND_URL || 'https://knowhow-backend-d2gs.onrender.com';
    if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
      // For local development, use production backend URL for webhook
      backendUrl = 'https://knowhow-backend-d2gs.onrender.com';
    }
    if (!backendUrl.startsWith('https://')) {
      backendUrl = backendUrl.replace(/^http:\/\//, 'https://');
    }
    const notifyUrl = `${backendUrl}/api/webhook`;

    // Create payment session with Cashfree
    // Validate and format phone number (Cashfree requires 10 digits for India)
    let formattedPhone = customerPhone.replace(/[^0-9]/g, '');
    // Remove country code if present (91XXXXXXXXXX -> XXXXXXXXXX)
    if (formattedPhone.length > 10 && formattedPhone.startsWith('91')) {
      formattedPhone = formattedPhone.substring(2);
    }
    // Ensure exactly 10 digits
    if (formattedPhone.length !== 10) {
      console.error('Invalid phone number format:', customerPhone, '->', formattedPhone);
      return res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 10 digits. Please enter a valid Indian mobile number.'
      });
    }
    
    // Ensure amount is a number (not string)
    const orderAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(orderAmount) || orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Amount must be a positive number.'
      });
    }
    
    const paymentSessionData = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: userId || customerEmail,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: formattedPhone,
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
        payment_methods: 'cc,dc,upi,nb' // cc=credit card, dc=debit card, upi=UPI, nb=netbanking
      },
      order_note: 'DIY Kit Order'
    };

    // Cashfree API endpoint: /pg/orders (creates order and returns payment_session_id)
    const cashfreeOrderUrl = `${CASHFREE_API_URL}/orders`;
    
    console.log('Cashfree request URL for DIY:', cashfreeOrderUrl);
    console.log('Cashfree request body for DIY:', JSON.stringify(paymentSessionData, null, 2));

    let sessionResponse;
    try {
      sessionResponse = await axios.post(
        cashfreeOrderUrl,
        paymentSessionData,
        { headers: getCashfreeHeaders() }
      );
    } catch (axiosError) {
      console.error('=== Cashfree API Error Details (DIY) ===');
      console.error('Status:', axiosError.response?.status);
      console.error('Status Text:', axiosError.response?.statusText);
      console.error('Response Data:', JSON.stringify(axiosError.response?.data, null, 2));
      console.error('Request URL:', axiosError.config?.url);
      console.error('Full Error:', axiosError.message);
      console.error('========================================');
      
      // Extract error message from Cashfree response
      const cashfreeError = axiosError.response?.data;
      let errorMessage = 'Failed to create payment session with Cashfree.';
      
      if (cashfreeError) {
        if (cashfreeError.message) {
          errorMessage = cashfreeError.message;
        } else if (cashfreeError.error) {
          errorMessage = cashfreeError.error;
        } else if (Array.isArray(cashfreeError) && cashfreeError.length > 0) {
          errorMessage = cashfreeError[0].message || cashfreeError[0].error || errorMessage;
        }
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: errorMessage,
        details: cashfreeError,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText
      });
    }

    console.log('Cashfree API response for DIY order:', JSON.stringify(sessionResponse.data, null, 2));

    // Cashfree API returns payment_session_id directly in data
    const paymentSessionId = sessionResponse.data?.payment_session_id || sessionResponse.data?.data?.payment_session_id;
    
    if (!paymentSessionId) {
      console.error('Cashfree API response missing payment_session_id:', sessionResponse.data);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment session. Payment gateway returned invalid response.',
        error: sessionResponse.data?.message || 'payment_session_id missing in response',
        response: sessionResponse.data
      });
    }

    console.log('Cashfree payment session created for DIY order:', paymentSessionId);

    // Save order to database
    const dbOrderData = {
      internal_bill_id: orderId,
      session_user_id: userId,
      amount: amount,
      currency: 'INR',
      receipt: orderId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      items: items,
      subtotal: subtotal,
      gst: 0, // No GST for now
      total_amount: amount,
      status: 'created',
      delivery_status: 'order_confirmed',
      notes: 'DIY Kit Order',
      cashfree_order_id: orderId,
      cashfree_payment_session_id: paymentSessionId
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(dbOrderData)
      .select()
      .single();

    if (orderError) {
      console.error('Error saving order:', orderError);
      console.error('Order data attempted:', JSON.stringify(dbOrderData, null, 2));
      
      // If error is about missing columns, provide helpful message
      if (orderError.message?.includes('cashfree') || orderError.code === 'PGRST116') {
        return res.status(500).json({
          success: false,
          message: 'Database columns missing. Please run the SQL migration: backend/sql/add-cashfree-columns.sql',
          error: orderError.message
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to save order: ' + orderError.message
      });
    }

    res.json({
      success: true,
      data: {
        order_id: orderId,
        payment_session_id: paymentSessionId,
        amount: amount,
        currency: 'INR',
        receipt: orderId
      }
    });
  } catch (error) {
    console.error('Error creating DIY order:', error);
    console.error('Error response:', error.response?.data);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to create order'
    });
  }
});

// Verify DIY order payment
router.post('/verify-diy-payment', async (req, res) => {
  try {
    if (!isCashfreeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { cashfree_order_id, cashfree_payment_id } = req.body;

    if (!cashfree_order_id || !cashfree_payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment details'
      });
    }

    // Get payment details from Cashfree
    const paymentResponse = await axios.get(
      `${CASHFREE_API_URL}/orders/${cashfree_order_id}/payments/${cashfree_payment_id}`,
      { headers: getCashfreeHeaders() }
    );

    const payment = paymentResponse.data;
    const paymentStatus = payment.payment_status;

    // Update order in database - try cashfree_order_id first, fallback for migration
    let order = null;
    let updateError = null;
    
    const updateData = {
      cashfree_payment_id: cashfree_payment_id,
      status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
      payment_method: payment.payment_method || 'unknown'
    };

    const result = await supabase
      .from('orders')
      .update(updateData)
      .eq('cashfree_order_id', cashfree_order_id)
      .select()
      .single();

    if (result.error) {
      // Try with razorpay_order_id for backward compatibility
      const legacyResult = await supabase
        .from('orders')
        .update({
          razorpay_payment_id: cashfree_payment_id,
          status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
          payment_method: payment.payment_method || 'unknown'
        })
        .eq('razorpay_order_id', cashfree_order_id)
        .select()
        .single();
      
      if (legacyResult.error) {
        updateError = legacyResult.error;
      } else {
        order = legacyResult.data;
      }
    } else {
      order = result.data;
    }

    if (updateError) {
      console.error('Error updating order:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update order'
      });
    }

    // Save payment details
    if (paymentStatus === 'SUCCESS') {
      await supabase
        .from('payments')
        .insert({
          cashfree_payment_id: payment.id,
          cashfree_order_id: cashfree_order_id,
          internal_bill_id: order.internal_bill_id,
          amount: payment.payment_amount,
          currency: payment.payment_currency || 'INR',
          status: 'paid',
          method: payment.payment_method || 'unknown',
          email: payment.customer_details?.customer_email,
          contact: payment.customer_details?.customer_phone,
          items: order.items,
          paid_at: new Date().toISOString()
        });
    }

    res.json({
      success: paymentStatus === 'SUCCESS',
      payment_status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
      order: order
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to verify payment'
    });
  }
});

// Get user DIY orders - uses cookie-based auth with email fallback
router.get('/my-diy-orders', async (req, res) => {
  try {
    // Try to get token from HttpOnly cookie first
    const accessToken = req.cookies?.accessToken;
    let userId = null;
    let userEmail = null;

    if (accessToken) {
      try {
        const decoded = verifyAccessToken(accessToken);
        if (decoded) {
          userId = decoded.userId;
          userEmail = decoded.email;
        }
      } catch (err) {
        console.log('Token verification failed');
      }
    }

    // If no token, try to get email from query (for guest orders lookup)
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

// Get all DIY orders (admin) - uses cookie-based auth
router.get('/all-diy-orders', async (req, res) => {
  try {
    // Only get token from HttpOnly cookie (secure by design)
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Use verifyAccessToken from generateToken utils (validates exp, iat, alg)
    const decoded = verifyAccessToken(accessToken);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
    
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

    // Try cashfree_order_id first, fallback to razorpay_order_id for migration
    let { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cashfree_order_id', order_id)
      .single();

    if (error || !order) {
      // Try with legacy razorpay_order_id
      const legacyResult = await supabase
        .from('orders')
        .select('*')
        .eq('razorpay_order_id', order_id)
        .single();
      
      if (legacyResult.error || !legacyResult.data) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
      order = legacyResult.data;
    }

    // If payment is still pending, check with Cashfree
    if (order.status === 'created' && isCashfreeConfigured()) {
      try {
        const orderResponse = await axios.get(
          `${CASHFREE_API_URL}/orders/${order_id}`,
          { headers: getCashfreeHeaders() }
        );

        const orderStatus = orderResponse.data.order_status;
        if (orderStatus === 'PAID') {
          // Update order status - try cashfree_order_id first
          const updateResult = await supabase
            .from('orders')
            .update({
              status: 'paid'
            })
            .eq('cashfree_order_id', order_id);
          
          // If that fails, try with razorpay_order_id for migration
          if (updateResult.error) {
            await supabase
              .from('orders')
              .update({
                status: 'paid'
              })
              .eq('razorpay_order_id', order_id);
          }
          
          order.status = 'paid';
        }
      } catch (cfError) {
        console.error('Error checking Cashfree order status:', cfError);
      }
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

// Update delivery status (admin) - uses cookie-based auth
router.post('/update-delivery-status/:order_id', async (req, res) => {
  try {
    // Only get token from HttpOnly cookie (secure by design)
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Use verifyAccessToken from generateToken utils (validates exp, iat, alg)
    const decoded = verifyAccessToken(accessToken);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
    
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
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update delivery status'
    });
  }
});

export default router;
