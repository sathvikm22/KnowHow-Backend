import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payments.js';
import orderRoutes from './routes/orders.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {

    // ✅ Allow requests with NO origin (Render health checks, Postman, curl)
    if (!origin) return callback(null, true);

    // Allowed frontend origins
    const allowedOrigins = [
      // Local development
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      
      // Production - Vercel frontend
      'https://know-how-frontend.vercel.app',
      'https://www.know-how-frontend.vercel.app',
      'https://know-how-frontend-rosy.vercel.app',
      'https://www.knowhowindia.in',
      'https://knowhowindia.in'
    ];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (important for Render)
app.set('trust proxy', true);

// Root route - for Render health checks and general info
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Know How Cafe API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api/auth'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check (Render uses this automatically)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Handle HEAD requests for health checks (some services use HEAD)
app.head('/health', (req, res) => {
  res.status(200).end();
});

app.head('/', (req, res) => {
  res.status(200).end();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', paymentRoutes);
app.use('/api', orderRoutes);

// Log available routes on startup
console.log('📋 Registered API routes:');
console.log('   GET  /api/auth/google - Google OAuth initiation');
console.log('   GET  /api/auth/google/callback - Google OAuth callback');
console.log('   POST /api/auth/signup/send-otp - Send signup OTP');
console.log('   POST /api/auth/login - User login');
console.log('   POST /api/create-order - Create Cashfree payment session (bookings)');
console.log('   POST /api/create-diy-order - Create Cashfree payment session (DIY orders)');
console.log('   POST /api/verify-payment - Verify payment');
console.log('   GET  /api/check-payment-status/:order_id - Check payment status');
console.log('   POST /api/webhook - Cashfree webhook handler');
console.log('   POST /api/cancel-booking/:booking_id - Cancel booking and refund');
console.log('   POST /api/update-booking/:booking_id - Update booking');
console.log('   GET  /api/my-bookings - Get user bookings');
console.log('   GET  /api/available-slots - Get available slots');

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.message?.includes('Not allowed by CORS')) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', {
    method: req.method,
    url: req.url,
    path: req.path,
    originalUrl: req.originalUrl
  });
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedPath: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth`);
});

export default app;
