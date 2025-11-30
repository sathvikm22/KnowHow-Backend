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
  console.log('✅ Razorpay initialized successfully');
} else {
  console.log('⚠️  Razorpay not configured - API keys missing. Payment features will be disabled.');
  console.log('   To enable: Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env file');
}

// Helper function to check if Razorpay is configured
const isRazorpayConfigured = () => {
  if (!razorpay) {
    return false;
  }
  return true;
};

// Create Razorpay order (for bookings)
router.post('/create-order', async (req, res) => {
  try {
    console.log('Create order request received:', { 
      hasAmount: !!req.body.amount, 
      hasSlotDetails: !!req.body.slotDetails 
    });
    
    if (!isRazorpayConfigured()) {
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

    // Convert amount to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Generate receipt ID
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const receiptId = `KH-${timestamp}-${random}`;

    // Create Razorpay order
    console.log('Creating Razorpay order with amount:', amountInPaise);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        booking_date: bookingDate,
        booking_time_slot: bookingTimeSlot,
        activities: selectedActivities?.join(', ') || '',
        combo_name: comboName || '',
        participants: participants?.toString() || '1'
      }
    });
    
    console.log('Razorpay order created:', razorpayOrder.id);

    // Save booking to database with pending_payment status
    console.log('Saving booking to database...');
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
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
        razorpay_order_id: razorpayOrder.id,
        amount: amount,
        currency: 'INR',
        payment_status: 'pending_payment',
        status: 'pending',
        internal_bill_id: receiptId,
        notes: notes
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error saving booking:', bookingError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save booking: ' + bookingError.message
      });
    }
    
    console.log('Booking saved successfully:', booking.id);

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
    console.error('Error creating Razorpay order:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create order'
    });
  }
});

// Verify payment and update booking
router.post('/verify-payment', async (req, res) => {
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

    // Check if this is a balance payment
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('balance_payment_order_id', razorpay_order_id)
      .maybeSingle();

    if (existingBooking && payment.status === 'captured') {
      // This is a balance payment - update the booking
      const { data: booking, error: updateError } = await supabase
        .from('bookings')
        .update({
          balance_payment_id: razorpay_payment_id,
          balance_payment_status: 'paid',
          balance_payment_method: payment.method,
          amount: existingBooking.amount + (existingBooking.balance_amount || 0)
        })
        .eq('id', existingBooking.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating booking with balance payment:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update booking with balance payment'
        });
      }

      return res.json({
        success: true,
        payment_status: 'paid',
        booking: booking,
        is_balance_payment: true
      });
    }

    // Regular payment - update booking in database
    const { data: booking, error: updateError } = await supabase
      .from('bookings')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature,
        payment_status: payment.status === 'captured' ? 'paid' : 'failed',
        payment_method: payment.method,
        status: payment.status === 'captured' ? 'confirmed' : 'pending'
      })
      .eq('razorpay_order_id', razorpay_order_id)
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
      payment_status: payment.status === 'captured' ? 'paid' : 'failed',
      booking: booking
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify payment'
    });
  }
});

// Check payment status
router.get('/check-payment-status/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('razorpay_order_id', order_id)
      .single();

    if (error || !booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
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

// Razorpay webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Razorpay webhook secret not configured');
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    const text = req.body.toString();
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== signature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = JSON.parse(text);

    // Handle payment.captured event
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;

      // Update booking status
      await supabase
        .from('bookings')
        .update({
          razorpay_payment_id: payment.id,
          payment_status: 'paid',
          payment_method: payment.method,
          status: 'confirmed'
        })
        .eq('razorpay_order_id', orderId);
    }

    // Handle payment.failed event
    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;

      // Update booking status
      await supabase
        .from('bookings')
        .update({
          razorpay_payment_id: payment.id,
          payment_status: 'failed',
          status: 'pending'
        })
        .eq('razorpay_order_id', orderId);
    }

    // Handle refund events
    if (event.event === 'refund.created') {
      const refund = event.payload.refund.entity;
      const paymentId = refund.payment_id;

      // Find booking by payment ID
      const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('razorpay_payment_id', paymentId)
        .single();

      if (booking) {
        await supabase
          .from('bookings')
          .update({
            refund_id: refund.id,
            refund_status: 'initiated',
            refund_amount: refund.amount / 100, // Convert from paise to rupees
            refund_initiated_at: new Date(refund.created_at * 1000).toISOString()
          })
          .eq('id', booking.id);
      }
    }

    if (event.event === 'refund.processed') {
      const refund = event.payload.refund.entity;
      const paymentId = refund.payment_id;

      // Find booking by payment ID
      const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('razorpay_payment_id', paymentId)
        .single();

      if (booking) {
        await supabase
          .from('bookings')
          .update({
            refund_status: 'processed',
            payment_status: 'refunded',
            status: 'cancelled',
            refund_processed_at: new Date().toISOString()
          })
          .eq('id', booking.id);
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
    if (!isRazorpayConfigured()) {
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

    // Initiate refund via Razorpay
    try {
      const refund = await razorpay.payments.refund(booking.razorpay_payment_id, {
        amount: Math.round(booking.amount * 100), // Convert to paise
        notes: {
          reason: reason || 'Customer requested cancellation',
          booking_id: booking_id
        }
      });

      // Update booking with refund details
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          refund_id: refund.id,
          refund_status: 'initiated',
          refund_amount: booking.amount,
          refund_reason: reason || 'Customer requested cancellation',
          refund_initiated_at: new Date().toISOString(),
          status: 'cancelled'
        })
        .eq('id', booking_id);

      if (updateError) {
        console.error('Error updating booking:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Refund initiated but failed to update booking'
        });
      }

      // Return booking data for receipt generation
      const { data: updatedBooking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking_id)
        .single();

      res.json({
        success: true,
        message: 'Refund initiated successfully',
        refund_id: refund.id,
        booking: updatedBooking
      });
    } catch (refundError) {
      console.error('Error initiating refund:', refundError);
      return res.status(500).json({
        success: false,
        message: refundError.message || 'Failed to initiate refund'
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
    if (!isRazorpayConfigured()) {
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
    let razorpayOrderId = null;
    let needsPayment = false;

    // Check if activity changed and calculate balance
    if (new_activity_name && new_activity_price) {
      const newPrice = parseFloat(new_activity_price) || 0;
      const oldPrice = booking.amount || 0;
      balanceAmount = newPrice - oldPrice;

      if (balanceAmount > 0) {
        // Need to collect balance payment
        needsPayment = true;
        const amountInPaise = Math.round(balanceAmount * 100);
        
        // Generate receipt ID
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const receiptId = `KH-BAL-${timestamp}-${random}`;

        try {
          // Create Razorpay order for balance payment
          const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: receiptId,
            notes: {
              booking_id: booking_id,
              type: 'balance_payment',
              original_amount: oldPrice,
              new_amount: newPrice,
              balance: balanceAmount
            }
          });

          razorpayOrderId = razorpayOrder.id;
        } catch (razorpayError) {
          console.error('Error creating Razorpay order for balance:', razorpayError);
          return res.status(500).json({
            success: false,
            message: 'Failed to create payment order for balance amount'
          });
        }
      } else if (balanceAmount < 0) {
        // Refund excess amount
        const refundAmount = Math.abs(balanceAmount);
        try {
          await razorpay.payments.refund(booking.razorpay_payment_id, {
            amount: Math.round(refundAmount * 100),
            notes: {
              reason: 'Activity change - excess amount refund',
              booking_id: booking_id
            }
          });
        } catch (refundError) {
          console.error('Error refunding excess amount:', refundError);
          // Continue with update even if refund fails
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

    if (razorpayOrderId) {
      updateData.balance_payment_order_id = razorpayOrderId;
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
      razorpay_order_id: razorpayOrderId
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update booking'
    });
  }
});

// Get user bookings
router.get('/my-bookings', async (req, res) => {
  try {
    // Get user ID from token
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

    // If no token, try to get email from query
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

// Get all bookings (admin only)
router.get('/all-bookings', async (req, res) => {
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
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
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
    let timeSlots = [];
    if (activity_name === 'Jewellery Lab' || activity_name === 'Jewelry Making') {
      timeSlots = ['11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'];
    } else if (activity_name === 'Tufting Experience') {
      timeSlots = ['11am-1:30pm', '2-4:30pm', '5-7:30pm'];
    } else {
      timeSlots = ['11am-1pm', '1-3pm', '3-5pm', '5-8pm'];
    }

    // Get booked slots for this activity and date
    const { data: bookedSlots, error } = await supabase
      .from('bookings')
      .select('booking_time_slot')
      .eq('activity_name', activity_name)
      .eq('booking_date', booking_date)
      .in('status', ['pending', 'confirmed'])
      .neq('payment_status', 'refunded');

    if (error) {
      console.error('Error fetching booked slots:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch booked slots'
      });
    }

    const bookedTimeSlots = bookedSlots?.map(b => b.booking_time_slot) || [];
    const availableSlots = timeSlots.filter(slot => !bookedTimeSlots.includes(slot));

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

