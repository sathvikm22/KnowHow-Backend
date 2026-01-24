import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { verifyAccessToken } from '../utils/generateToken.js';

const router = express.Router();

// Cashfree Configuration
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_MODE = process.env.CASHFREE_MODE || 'production'; // 'production' or 'sandbox'
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

// Initialize Cashfree
if (isCashfreeConfigured()) {
  console.log('✅ Cashfree initialized successfully');
  console.log('   Mode:', CASHFREE_MODE);
  console.log('   API URL:', CASHFREE_API_URL);
} else {
  console.log('⚠️  Cashfree not configured - API keys missing. Payment features will be disabled.');
  console.log('   To enable: Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env file');
}

// Helper function to get Cashfree headers
const getCashfreeHeaders = () => {
  return {
    'x-client-id': CASHFREE_APP_ID,
    'x-client-secret': CASHFREE_SECRET_KEY,
    'x-api-version': '2023-08-01',
    'Content-Type': 'application/json'
  };
};

// Create Cashfree payment session (for bookings)
router.post('/create-order', async (req, res) => {
  try {
    console.log('Create order request received:', { 
      hasAmount: !!req.body.amount, 
      hasSlotDetails: !!req.body.slotDetails 
    });
    
    if (!isCashfreeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { amount, slotDetails } = req.body;
    
    console.log('Processing order:', { amount, slotDetails: slotDetails ? 'present' : 'missing' });

    if (!amount || !slotDetails) {
      return res.status(400).json({
        success: false,
        message: 'Amount and slot details are required'
      });
    }

    // Validate slot details
    const {
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      bookingDate,
      bookingTimeSlot,
      selectedActivities,
      comboName,
      participants,
      items,
      notes
    } = slotDetails;

    if (!customerName || !customerEmail || !customerPhone || !bookingDate || !bookingTimeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking details'
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
    const orderId = `KH-${timestamp}-${random}`;

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
    
    const returnUrl = `${frontendUrl}/payment-processing?order_id=${orderId}&type=booking`;
    
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
    console.log('Creating Cashfree payment session with amount:', amount);
    
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
      order_note: `Booking for ${selectedActivities?.join(', ') || comboName || 'Activity'} on ${bookingDate} at ${bookingTimeSlot}`
    };

    // Cashfree API endpoint: /pg/orders (creates order and returns payment_session_id)
    const cashfreeOrderUrl = `${CASHFREE_API_URL}/orders`;
    
    console.log('Cashfree request URL:', cashfreeOrderUrl);
    console.log('Cashfree request headers:', {
      'x-client-id': CASHFREE_APP_ID ? `${CASHFREE_APP_ID.substring(0, 10)}...` : 'MISSING',
      'x-client-secret': CASHFREE_SECRET_KEY ? 'SET' : 'MISSING',
      'x-api-version': '2023-08-01'
    });
    console.log('Return URL (must be HTTPS):', returnUrl);
    console.log('Notify URL (must be HTTPS):', notifyUrl);
    console.log('Cashfree request body:', JSON.stringify(paymentSessionData, null, 2));

    let sessionResponse;
    try {
      sessionResponse = await axios.post(
        cashfreeOrderUrl,
        paymentSessionData,
        { headers: getCashfreeHeaders() }
      );
    } catch (axiosError) {
      console.error('=== Cashfree API Error Details ===');
      console.error('Status:', axiosError.response?.status);
      console.error('Status Text:', axiosError.response?.statusText);
      console.error('Response Data:', JSON.stringify(axiosError.response?.data, null, 2));
      console.error('Request URL:', axiosError.config?.url);
      console.error('Request Headers:', axiosError.config?.headers);
      console.error('Request Data:', JSON.stringify(axiosError.config?.data, null, 2));
      console.error('Full Error:', axiosError.message);
      console.error('===================================');
      
      // Extract error message from Cashfree response
      const cashfreeError = axiosError.response?.data;
      let errorMessage = 'Failed to create payment session with Cashfree.';
      
      if (cashfreeError) {
        // Cashfree error format: { message: "...", ... } or { error: "...", ... }
        if (cashfreeError.message) {
          errorMessage = cashfreeError.message;
        } else if (cashfreeError.error) {
          errorMessage = cashfreeError.error;
        } else if (Array.isArray(cashfreeError) && cashfreeError.length > 0) {
          // Sometimes Cashfree returns array of errors
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

    console.log('Cashfree API response:', JSON.stringify(sessionResponse.data, null, 2));

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

    console.log('Cashfree payment session created:', paymentSessionId);

    // Save booking to database with pending_payment status
    console.log('Saving booking to database...');
    
    // Build booking data object
    const bookingData = {
      user_id: userId,
      user_email: userEmail,
      user_name: customerName,
      user_phone: customerPhone,
      user_address: customerAddress,
      activity_name: selectedActivities?.[0] || comboName || 'Activity',
      combo_name: comboName,
      selected_activities: selectedActivities || [],
      booking_date: bookingDate,
      booking_time_slot: bookingTimeSlot,
      participants: participants || 1,
      amount: amount,
      currency: 'INR',
      payment_status: 'pending_payment',
      status: 'pending',
      internal_bill_id: orderId,
      notes: notes
    };

    // Add Cashfree fields if columns exist (will fail gracefully if they don't)
    bookingData.cashfree_order_id = orderId;
    bookingData.cashfree_payment_session_id = paymentSessionId;

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();

    if (bookingError) {
      console.error('Error saving booking:', bookingError);
      console.error('Booking data attempted:', JSON.stringify(bookingData, null, 2));
      
      // If error is about missing columns, provide helpful message
      if (bookingError.message?.includes('cashfree') || bookingError.code === 'PGRST116') {
        return res.status(500).json({
          success: false,
          message: 'Database columns missing. Please run the SQL migration: backend/sql/add-cashfree-columns.sql',
          error: bookingError.message
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to save booking: ' + bookingError.message
      });
    }
    
    console.log('Booking saved successfully:', booking.id);

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
    console.error('Error creating Cashfree order:', error);
    console.error('Error response:', error.response?.data);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to create order'
    });
  }
});

// Verify payment and update booking
router.post('/verify-payment', async (req, res) => {
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

    // Update booking in database - try cashfree_order_id first, fallback to razorpay_order_id for migration
    let booking = null;
    let updateError = null;
    
    // Try with cashfree_order_id first
    const updateData = {
      cashfree_payment_id: cashfree_payment_id,
      payment_status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
      payment_method: payment.payment_method || 'unknown',
      status: paymentStatus === 'SUCCESS' ? 'confirmed' : 'pending'
    };

    const result = await supabase
      .from('bookings')
      .update(updateData)
      .eq('cashfree_order_id', cashfree_order_id)
      .select()
      .single();

    if (result.error) {
      // Try with razorpay_order_id for backward compatibility during migration
      const legacyResult = await supabase
        .from('bookings')
        .update({
          razorpay_payment_id: cashfree_payment_id,
          payment_status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
          payment_method: payment.payment_method || 'unknown',
          status: paymentStatus === 'SUCCESS' ? 'confirmed' : 'pending'
        })
        .eq('razorpay_order_id', cashfree_order_id)
        .select()
        .single();
      
      if (legacyResult.error) {
        updateError = legacyResult.error;
      } else {
        booking = legacyResult.data;
      }
    } else {
      booking = result.data;
    }

    if (updateError) {
      console.error('Error updating booking:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update booking'
      });
    }

    res.json({
      success: paymentStatus === 'SUCCESS',
      payment_status: paymentStatus === 'SUCCESS' ? 'paid' : 'failed',
      booking: booking
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to verify payment'
    });
  }
});

// Check payment status
router.get('/check-payment-status/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;

    // Try cashfree_order_id first, fallback to razorpay_order_id for migration
    let { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('cashfree_order_id', order_id)
      .single();

    if (error || !booking) {
      // Try with legacy razorpay_order_id
      const legacyResult = await supabase
        .from('bookings')
        .select('*')
        .eq('razorpay_order_id', order_id)
        .single();
      
      if (legacyResult.error || !legacyResult.data) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      booking = legacyResult.data;
    }

    // If payment is still pending, check with Cashfree
    if (booking.payment_status === 'pending_payment' && isCashfreeConfigured()) {
      try {
        const orderResponse = await axios.get(
          `${CASHFREE_API_URL}/orders/${order_id}`,
          { headers: getCashfreeHeaders() }
        );

        const orderStatus = orderResponse.data.order_status;
        if (orderStatus === 'PAID') {
          // Update booking status - try cashfree_order_id first
          const updateResult = await supabase
            .from('bookings')
            .update({
              payment_status: 'paid',
              status: 'confirmed'
            })
            .eq('cashfree_order_id', order_id);
          
          // If that fails, try with razorpay_order_id for migration
          if (updateResult.error) {
            await supabase
              .from('bookings')
              .update({
                payment_status: 'paid',
                status: 'confirmed'
              })
              .eq('razorpay_order_id', order_id);
          }
          
          booking.payment_status = 'paid';
          booking.status = 'confirmed';
        }
      } catch (cfError) {
        console.error('Error checking Cashfree order status:', cfError);
      }
    }

    res.json({
      success: true,
      data: {
        payment_status: booking.payment_status,
        booking_status: booking.status,
        booking: booking
      },
      payment_status: booking.payment_status,
      booking_status: booking.status,
      booking: booking
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check payment status'
    });
  }
});

// Cashfree webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-cashfree-signature'];
    // Cashfree uses the API Secret Key (not a separate webhook secret)
    const apiSecretKey = process.env.CASHFREE_SECRET_KEY;

    if (!apiSecretKey) {
      console.error('Cashfree API Secret Key not configured');
      return res.status(500).json({ success: false, message: 'Cashfree API Secret Key not configured' });
    }

    // Verify webhook signature using API Secret Key
    const text = req.body.toString();
    const generatedSignature = crypto
      .createHmac('sha256', apiSecretKey)
      .update(text)
      .digest('base64');

    if (generatedSignature !== signature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = JSON.parse(text);
    console.log('Cashfree webhook received:', event.type);

    // Extract common data
    const orderId = event.data?.order?.order_id;
    const paymentData = event.data?.payment || {};
    const paymentId = paymentData.payment_id;
    const orderData = event.data?.order || {};

    if (!orderId || !paymentId) {
      console.error('Missing order_id or payment_id in webhook:', event);
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Determine if this is a booking or DIY order based on order_id prefix
    const isDIYOrder = orderId.startsWith('KH-DIY-');
    const orderType = isDIYOrder ? 'diy' : 'booking';

    // Store complete Cashfree payment data
    const cashfreePaymentData = {
      event_type: event.type,
      order: orderData,
      payment: paymentData,
      received_at: new Date().toISOString()
    };

    // Handle payment success event
    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const paymentStatus = paymentData.payment_status || 'SUCCESS';
      const paymentMethod = paymentData.payment_method || 'unknown';

      if (isDIYOrder) {
        // Update DIY order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('cashfree_order_id', orderId)
          .single();

        if (!orderError && order) {
          // Update order
          await supabase
            .from('orders')
            .update({
              cashfree_payment_id: paymentId,
              status: 'paid',
              payment_method: paymentMethod,
              cashfree_payment_data: cashfreePaymentData
            })
            .eq('cashfree_order_id', orderId);

          // Save payment details to payments table
          await supabase
            .from('payments')
            .insert({
              cashfree_payment_id: paymentId,
              cashfree_order_id: orderId,
              internal_bill_id: order.internal_bill_id,
              order_type: 'diy',
              amount: paymentData.payment_amount || order.amount,
              currency: paymentData.payment_currency || order.currency || 'INR',
              status: 'paid',
              method: paymentMethod,
              email: paymentData.customer_details?.customer_email || order.customer_email,
              contact: paymentData.customer_details?.customer_phone || order.customer_phone,
              // Card details
              card_last4: paymentData.payment_method_details?.card?.card_last4,
              card_network: paymentData.payment_method_details?.card?.card_network,
              card_type: paymentData.payment_method_details?.card?.card_type,
              card_issuer: paymentData.payment_method_details?.card?.card_issuer,
              // UPI details
              upi_vpa: paymentData.payment_method_details?.upi?.vpa,
              upi_flow: paymentData.payment_method_details?.upi?.flow,
              bank_transaction_id: paymentData.payment_method_details?.upi?.bank_transaction_id,
              // Netbanking details
              bank: paymentData.payment_method_details?.netbanking?.bank,
              account_type: paymentData.payment_method_details?.netbanking?.account_type,
              // Wallet details
              wallet_name: paymentData.payment_method_details?.wallet?.wallet_name,
              wallet_transaction_id: paymentData.payment_method_details?.wallet?.wallet_transaction_id,
              items: order.items,
              cashfree_payment_data: cashfreePaymentData,
              paid_at: new Date().toISOString()
            });
        }
      } else {
        // Update booking
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('*')
          .eq('cashfree_order_id', orderId)
          .single();

        if (!bookingError && booking) {
          // Update booking
          await supabase
            .from('bookings')
            .update({
              cashfree_payment_id: paymentId,
              payment_status: 'paid',
              payment_method: paymentMethod,
              status: 'confirmed',
              cashfree_payment_data: cashfreePaymentData
            })
            .eq('cashfree_order_id', orderId);

          // Save payment details to payments table
          await supabase
            .from('payments')
            .insert({
              cashfree_payment_id: paymentId,
              cashfree_order_id: orderId,
              internal_bill_id: booking.internal_bill_id || orderId,
              order_type: 'booking',
              amount: paymentData.payment_amount || Math.round(booking.amount * 100), // Convert to paise
              currency: paymentData.payment_currency || booking.currency || 'INR',
              status: 'paid',
              method: paymentMethod,
              email: paymentData.customer_details?.customer_email || booking.user_email,
              contact: paymentData.customer_details?.customer_phone || booking.user_phone,
              // Card details
              card_last4: paymentData.payment_method_details?.card?.card_last4,
              card_network: paymentData.payment_method_details?.card?.card_network,
              card_type: paymentData.payment_method_details?.card?.card_type,
              card_issuer: paymentData.payment_method_details?.card?.card_issuer,
              // UPI details
              upi_vpa: paymentData.payment_method_details?.upi?.vpa,
              upi_flow: paymentData.payment_method_details?.upi?.flow,
              bank_transaction_id: paymentData.payment_method_details?.upi?.bank_transaction_id,
              // Netbanking details
              bank: paymentData.payment_method_details?.netbanking?.bank,
              account_type: paymentData.payment_method_details?.netbanking?.account_type,
              // Wallet details
              wallet_name: paymentData.payment_method_details?.wallet?.wallet_name,
              wallet_transaction_id: paymentData.payment_method_details?.wallet?.wallet_transaction_id,
              items: booking.selected_activities ? [{ name: booking.activity_name, activities: booking.selected_activities }] : [],
              cashfree_payment_data: cashfreePaymentData,
              paid_at: new Date().toISOString()
            });
        }
      }
    }

    // Handle payment failure event
    if (event.type === 'PAYMENT_FAILED_WEBHOOK') {
      if (isDIYOrder) {
        // Update DIY order
        await supabase
          .from('orders')
          .update({
            cashfree_payment_id: paymentId,
            status: 'failed',
            cashfree_payment_data: cashfreePaymentData
          })
          .eq('cashfree_order_id', orderId);
      } else {
        // Update booking
        await supabase
          .from('bookings')
          .update({
            cashfree_payment_id: paymentId,
            payment_status: 'failed',
            status: 'pending',
            cashfree_payment_data: cashfreePaymentData
          })
          .eq('cashfree_order_id', orderId);
      }
    }

    // Handle refund event (only for bookings)
    if (event.type === 'REFUND_WEBHOOK' && !isDIYOrder) {
      const refundData = event.data?.refund || {};
      const refundId = refundData.refund_id;
      const refundAmount = refundData.refund_amount;
      const refundStatus = refundData.refund_status;

      if (refundId) {
        // Update booking with refund details
        await supabase
          .from('bookings')
          .update({
            refund_id: refundId,
            refund_status: refundStatus === 'SUCCESS' ? 'processed' : 'initiated',
            refund_amount: refundAmount ? refundAmount / 100 : null, // Convert from paise to rupees
            refund_processed_at: refundStatus === 'SUCCESS' ? new Date().toISOString() : null,
            payment_status: refundStatus === 'SUCCESS' ? 'refunded' : 'paid',
            cashfree_refund_data: {
              refund: refundData,
              received_at: new Date().toISOString()
            }
          })
          .eq('cashfree_order_id', orderId);

        // Update payment record
        const { data: payment } = await supabase
          .from('payments')
          .select('*')
          .eq('cashfree_order_id', orderId)
          .single();

        if (payment) {
          const newRefundAmount = (payment.refund_amount || 0) + (refundAmount || 0);
          const newRefundStatus = newRefundAmount >= payment.amount ? 'full' : 'partial';
          
          await supabase
            .from('payments')
            .update({
              refund_status: newRefundStatus,
              refund_amount: newRefundAmount,
              refund_ids: [...(payment.refund_ids || []), refundId],
              status: newRefundStatus === 'full' ? 'refunded' : 'partially_refunded'
            })
            .eq('cashfree_payment_id', paymentId);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel booking and initiate refund
router.post('/cancel-booking/:booking_id', async (req, res) => {
  try {
    if (!isCashfreeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { booking_id } = req.params;
    const { reason } = req.body;

    // Get booking details
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Only paid bookings can be cancelled'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    // Initiate refund via Cashfree
    try {
      const orderId = booking.cashfree_order_id || booking.razorpay_order_id;
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID not found for refund'
        });
      }

      // First, fetch order details from Cashfree to get the actual transaction amount
      let orderDetails = null;
      let originalAmountInPaise = 0;
      let alreadyRefundedInPaise = 0;
      
      try {
        const orderResponse = await axios.get(
          `${CASHFREE_API_URL}/orders/${orderId}`,
          { headers: getCashfreeHeaders() }
        );
        orderDetails = orderResponse.data;
        
        // Get order amount from Cashfree (in paise)
        originalAmountInPaise = orderDetails.order_amount || 0;
        
        // Get existing refunds from Cashfree
        try {
          const refundsResponse = await axios.get(
            `${CASHFREE_API_URL}/orders/${orderId}/refunds`,
            { headers: getCashfreeHeaders() }
          );
          
          const refunds = refundsResponse.data.refunds || [];
          // Sum up all existing refund amounts
          alreadyRefundedInPaise = refunds.reduce((sum, refund) => {
            return sum + (refund.refund_amount || 0);
          }, 0);
          
          console.log(`Order ${orderId}: Original amount = ${originalAmountInPaise} paise, Already refunded = ${alreadyRefundedInPaise} paise`);
        } catch (refundsError) {
          console.warn('Could not fetch existing refunds from Cashfree:', refundsError.message);
          // Continue with 0 already refunded
        }
      } catch (orderError) {
        console.error('Error fetching order details from Cashfree:', orderError.response?.data || orderError.message);
        
        // Fallback: Try to get from payment record
        const { data: payment } = await supabase
          .from('payments')
          .select('amount, refund_amount')
          .eq('cashfree_order_id', orderId)
          .single();
        
        if (payment) {
          originalAmountInPaise = payment.amount || 0;
          alreadyRefundedInPaise = payment.refund_amount || 0;
          console.log(`Using payment record: Original = ${originalAmountInPaise} paise, Already refunded = ${alreadyRefundedInPaise} paise`);
        } else {
          // Last resort: use booking amount
          originalAmountInPaise = Math.round(booking.amount * 100);
          console.log(`Using booking amount as fallback: ${originalAmountInPaise} paise`);
        }
      }

      // Calculate refundable amount
      const refundableAmountInPaise = originalAmountInPaise - alreadyRefundedInPaise;
      
      if (refundableAmountInPaise <= 0) {
        return res.status(400).json({
          success: false,
          message: 'No refundable amount available. This booking may have already been fully refunded.'
        });
      }
      
      // Refund the full refundable amount
      const refundAmountInPaise = refundableAmountInPaise;
      
      console.log(`Calculated refundable amount: ${refundAmountInPaise} paise (${refundAmountInPaise / 100} rupees)`);
      console.log(`Original: ${originalAmountInPaise} paise, Already refunded: ${alreadyRefundedInPaise} paise, Refundable: ${refundAmountInPaise} paise`);
      
      const refundData = {
        refund_amount: refundAmountInPaise,
        refund_id: `REF-${orderId}-${Date.now()}`,
        refund_note: reason || 'Customer requested cancellation',
        refund_type: 'MERCHANT_INITIATED'
      };

      console.log('Initiating refund with Cashfree:', refundData);

      const refundResponse = await axios.post(
        `${CASHFREE_API_URL}/orders/${orderId}/refunds`,
        refundData,
        { headers: getCashfreeHeaders() }
      );

      const refund = refundResponse.data;
      console.log('Cashfree refund response:', refund);

      // Calculate refund amount in rupees for database storage
      const refundAmountInRupees = refundAmountInPaise / 100;
      
      // Update booking with refund details
      const updateResult = await supabase
        .from('bookings')
        .update({
          refund_id: refund.refund_id,
          refund_status: 'initiated',
          refund_amount: refundAmountInRupees,
          refund_reason: reason || 'Customer requested cancellation',
          refund_initiated_at: new Date().toISOString(),
          status: 'cancelled'
        })
        .eq('id', booking_id);
      
      const updateError = updateResult.error;

      if (updateError) {
        console.error('Error updating booking:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Refund initiated but failed to update booking'
        });
      }

      // Update payment record with refund details if payment record exists
      const { data: paymentRecord } = await supabase
        .from('payments')
        .select('refund_amount, refund_ids, cashfree_payment_id, amount')
        .eq('cashfree_order_id', orderId)
        .single();
      
      if (paymentRecord) {
        const newRefundAmount = (paymentRecord.refund_amount || 0) + refundAmountInPaise;
        const newRefundStatus = newRefundAmount >= (paymentRecord.amount || originalAmountInPaise) ? 'full' : 'partial';
        
        const existingRefundIds = Array.isArray(paymentRecord.refund_ids) ? paymentRecord.refund_ids : [];
        const updatedRefundIds = [...existingRefundIds, refund.refund_id];
        
        await supabase
          .from('payments')
          .update({
            refund_status: newRefundStatus,
            refund_amount: newRefundAmount,
            refund_ids: updatedRefundIds,
            status: newRefundStatus === 'full' ? 'refunded' : 'partially_refunded'
          })
          .eq('cashfree_payment_id', paymentRecord.cashfree_payment_id);
      }

      // Return booking data for receipt generation
      const { data: updatedBooking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking_id)
        .single();

      res.json({
        success: true,
        message: 'Refund initiated successfully. The refund will be processed within 5-7 business days.',
        refund_id: refund.refund_id,
        refund_amount: refundAmountInRupees,
        booking: updatedBooking
      });
    } catch (refundError) {
      console.error('Error initiating refund:', refundError);
      console.error('Refund error response:', refundError.response?.data);
      console.error('Refund error status:', refundError.response?.status);
      
      const errorMessage = refundError.response?.data?.message || refundError.message || 'Failed to initiate refund';
      
      // Provide more specific error messages
      if (errorMessage.includes('cannot be greater than the transaction amount')) {
        return res.status(400).json({
          success: false,
          message: 'Refund amount exceeds available balance. This booking may have already been partially refunded. Please contact support.'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel booking'
    });
  }
});

// Update booking date/time
router.post('/update-booking/:booking_id', async (req, res) => {
  try {
    if (!isCashfreeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const { booking_id } = req.params;
    const { booking_date, booking_time_slot, new_activity_name, new_activity_price } = req.body;

    if (!booking_date || !booking_time_slot) {
      return res.status(400).json({
        success: false,
        message: 'Booking date and time slot are required'
      });
    }

    // Get current booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update cancelled booking'
      });
    }

    let balanceAmount = 0;
    let cashfreeOrderId = null;
    let needsPayment = false;

    // Check if activity changed and calculate balance
    if (new_activity_name && new_activity_price) {
      const newPrice = parseFloat(new_activity_price) || 0;
      const oldPrice = booking.amount || 0;
      balanceAmount = newPrice - oldPrice;

      if (balanceAmount > 0) {
        // Need to collect balance payment
        needsPayment = true;
        
        // Generate order ID for balance payment
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const balanceOrderId = `KH-BAL-${timestamp}-${random}`;

        // Cashfree requires HTTPS URLs
        let frontendUrl = process.env.FRONTEND_URL || 'https://www.knowhowindia.in';
        if (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) {
          frontendUrl = 'https://www.knowhowindia.in';
        }
        if (!frontendUrl.startsWith('https://')) {
          frontendUrl = frontendUrl.replace(/^http:\/\//, 'https://');
        }
        const returnUrl = `${frontendUrl}/payment-processing?order_id=${balanceOrderId}&type=booking`;

        // Create Cashfree payment session for balance payment
        const paymentSessionData = {
          order_id: balanceOrderId,
          order_amount: balanceAmount,
          order_currency: 'INR',
          customer_details: {
            customer_id: booking.user_id || booking.user_email,
            customer_name: booking.user_name,
            customer_email: booking.user_email,
            customer_phone: booking.user_phone,
          },
          order_meta: {
            return_url: returnUrl,
            payment_methods: 'cc,dc,upi,nb' // cc=credit card, dc=debit card, upi=UPI, nb=netbanking
          },
          order_note: `Balance payment for booking ${booking_id}`
        };

        let sessionResponse;
        try {
          sessionResponse = await axios.post(
            `${CASHFREE_API_URL}/orders`,
            paymentSessionData,
            { headers: getCashfreeHeaders() }
          );
          
          // Get payment_session_id from response
          const paymentSessionId = sessionResponse.data?.payment_session_id || sessionResponse.data?.data?.payment_session_id;
          if (!paymentSessionId) {
            throw new Error('Payment session ID not received from Cashfree');
          }
          
          cashfreeOrderId = balanceOrderId;
        } catch (cfError) {
          console.error('=== Cashfree API Error (Balance Payment) ===');
          console.error('Status:', cfError.response?.status);
          console.error('Response Data:', JSON.stringify(cfError.response?.data, null, 2));
          console.error('============================================');
          
          const errorMessage = cfError.response?.data?.message || cfError.message || 'Failed to create payment session';
          return res.status(500).json({
            success: false,
            message: errorMessage,
            error: errorMessage
          });
        }
      } else if (balanceAmount < 0) {
        // Refund excess amount - but check if already refunded
        const excessAmount = Math.abs(balanceAmount);
        const orderId = booking.cashfree_order_id || booking.razorpay_order_id;
        
        if (orderId) {
          try {
            // Get payment record to check original amount and already refunded amount
            const { data: payment } = await supabase
              .from('payments')
              .select('amount, refund_amount')
              .eq('cashfree_order_id', orderId)
              .single();

            if (payment) {
              // Calculate refundable amount
              // payment.amount is in paise, refund_amount is also in paise
              const originalAmountInPaise = payment.amount || 0;
              const alreadyRefundedInPaise = payment.refund_amount || 0;
              const refundableAmountInPaise = originalAmountInPaise - alreadyRefundedInPaise;
              
              // Convert excess amount to paise
              const excessAmountInPaise = Math.round(excessAmount * 100);
              
              // Only refund if there's refundable amount available and excess is within refundable limit
              if (refundableAmountInPaise > 0 && excessAmountInPaise <= refundableAmountInPaise) {
                const refundData = {
                  refund_amount: excessAmountInPaise,
                  refund_id: `REF-${orderId}-${Date.now()}`,
                  refund_note: 'Activity change - excess amount refund',
                  refund_type: 'MERCHANT_INITIATED'
                };

                await axios.post(
                  `${CASHFREE_API_URL}/orders/${orderId}/refunds`,
                  refundData,
                  { headers: getCashfreeHeaders() }
                );
                console.log(`Refunded ${excessAmountInPaise} paise (${excessAmount} rupees) for booking update`);
              } else {
                console.warn(`Cannot refund excess amount: refundable=${refundableAmountInPaise} paise, requested=${excessAmountInPaise} paise`);
                // Don't throw error, just log warning and continue with update
              }
            } else {
              // No payment record found, try to refund anyway (legacy support)
              const refundData = {
                refund_amount: Math.round(excessAmount * 100), // Convert to paise
                refund_id: `REF-${orderId}-${Date.now()}`,
                refund_note: 'Activity change - excess amount refund',
                refund_type: 'MERCHANT_INITIATED'
              };

              await axios.post(
                `${CASHFREE_API_URL}/orders/${orderId}/refunds`,
                refundData,
                { headers: getCashfreeHeaders() }
              );
            }
          } catch (refundError) {
            console.error('Error refunding excess amount:', refundError);
            const errorMessage = refundError.response?.data?.message || refundError.message;
            console.error('Refund error details:', errorMessage);
            // Continue with update even if refund fails - don't block the booking update
            // The error will be logged but won't prevent the booking from being updated
          }
        }
      }
    }

    // Update booking
    const updateData = {
      is_updated: true,
      original_booking_date: booking.booking_date,
      original_booking_time_slot: booking.booking_time_slot,
      updated_booking_date: booking_date,
      updated_booking_time_slot: booking_time_slot,
      booking_date: booking_date,
      booking_time_slot: booking_time_slot
    };

    if (new_activity_name) {
      updateData.activity_name = new_activity_name;
      if (new_activity_price) {
        updateData.amount = parseFloat(new_activity_price);
      }
    }

    if (cashfreeOrderId) {
      updateData.balance_payment_order_id = cashfreeOrderId;
      updateData.balance_amount = balanceAmount;
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', booking_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating booking:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update booking'
      });
    }

    res.json({
      success: true,
      message: needsPayment ? 'Booking updated. Please complete balance payment.' : 'Booking updated successfully',
      booking: updatedBooking,
      needs_payment: needsPayment,
      balance_amount: balanceAmount,
      cashfree_order_id: cashfreeOrderId
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update booking'
    });
  }
});

// Get user bookings - uses cookie-based auth with email fallback
router.get('/my-bookings', async (req, res) => {
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

    // If no token, try to get email from query (for guest bookings lookup)
    if (!userId && !userEmail) {
      userEmail = req.query.email;
    }

    if (!userId && !userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Build query
    let query = supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bookings'
      });
    }

    res.json({
      success: true,
      bookings: bookings || []
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch bookings'
    });
  }
});

// Get all bookings (admin only) - uses cookie-based auth
router.get('/all-bookings', async (req, res) => {
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

    // Get all bookings
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bookings'
      });
    }

    res.json({
      success: true,
      bookings: bookings || []
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch bookings'
    });
  }
});

// Get available slots for an activity on a specific date
router.get('/available-slots', async (req, res) => {
  try {
    const { activity_name, booking_date } = req.query;

    if (!activity_name || !booking_date) {
      return res.status(400).json({
        success: false,
        message: 'Activity name and booking date are required'
      });
    }

    // Get all time slots for the activity (from Booking.tsx logic)
    // Handle different activity name variations
    let timeSlots = [];
    const normalizedActivityName = activity_name.toLowerCase().trim();
    
    if (normalizedActivityName.includes('jewellery') || normalizedActivityName.includes('jewelry making')) {
      timeSlots = ['11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'];
    } else if (normalizedActivityName.includes('tufting')) {
      timeSlots = ['11am-1:30pm', '2-4:30pm', '5-7:30pm'];
    } else {
      timeSlots = ['11am-1pm', '1-3pm', '3-5pm', '5-8pm'];
    }

    console.log('Fetching available slots:', { activity_name, booking_date, timeSlots });

    // Get booked slots for this activity and date
    // Get all bookings for this date and filter by activity/combo name (handles variations)
    const { data: allBookings, error } = await supabase
      .from('bookings')
      .select('booking_time_slot, activity_name, combo_name')
      .eq('booking_date', booking_date)
      .in('status', ['pending', 'confirmed'])
      .neq('payment_status', 'refunded');
    
    let bookedSlots = [];
    if (allBookings && !error) {
      // Filter bookings that match the activity (check both activity_name and combo_name)
      bookedSlots = allBookings
        .filter(b => {
          const bookingActivity = (b.activity_name || '').toLowerCase().trim();
          const bookingCombo = (b.combo_name || '').toLowerCase().trim();
          const searchActivity = activity_name.toLowerCase().trim();
          
          // Match if activity_name or combo_name matches (case-insensitive)
          return bookingActivity === searchActivity || 
                 bookingCombo === searchActivity ||
                 bookingActivity.includes(searchActivity) ||
                 searchActivity.includes(bookingActivity);
        })
        .map(b => ({ booking_time_slot: b.booking_time_slot }));
    }

    if (error) {
      console.error('Error fetching booked slots:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch booked slots'
      });
    }

    const bookedTimeSlots = bookedSlots?.map(b => b.booking_time_slot) || [];
    const availableSlots = timeSlots.filter(slot => !bookedTimeSlots.includes(slot));
    
    console.log('Booked slots:', bookedTimeSlots);
    console.log('Available slots:', availableSlots);

    res.json({
      success: true,
      available_slots: availableSlots,
      all_slots: timeSlots,
      booked_slots: bookedTimeSlots
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available slots'
    });
  }
});

export default router;
