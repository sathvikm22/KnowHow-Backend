# Know How Cafe - Backend API

A robust Node.js/Express backend API for Know How Cafe, a creative workshop and DIY kit e-commerce platform. This backend handles user authentication, booking management, payment processing, and order fulfillment.

## 🚀 Live Deployment

- **Hosting**: Render 
- **Custom Domain**: Configured via Render DNS settings

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Third-Party Integrations](#third-party-integrations)
- [Deployment](#deployment)
- [Security](#security)

## 🛠 Tech Stack

### Core Technologies
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js 4.18.2
- **Language**: JavaScript (ES6+)

### Database & Storage
- **Database**: Supabase (PostgreSQL)
- **ORM/Client**: `@supabase/supabase-js` 2.38.4

### Authentication & Security
- **JWT**: `jsonwebtoken` 9.0.2 (Token-based authentication)
- **Password Hashing**: `bcryptjs` 2.4.3
- **CORS**: `cors` 2.8.5 (Cross-origin resource sharing)

### Email Services
- **Provider**: Brevo (formerly Sendinblue)
- **Method**: REST API (HTTPS-based, works on Render)
- **Package**: `axios` 1.6.2 (HTTP client for Brevo API)

### Payment Gateway
- **Provider**: Cashfree
- **Mode**: Production & Sandbox support
- **Features**: 
  - Payment session creation
  - Webhook handling
  - Refund processing
  - Payment verification

### OAuth Integration
- **Provider**: Google OAuth 2.0
- **Flow**: Authorization Code Flow
- **Scopes**: `openid email profile`

### Utilities
- **Environment**: `dotenv` 16.3.1
- **HTTP Client**: `axios` 1.6.2

## ✨ Features

### Authentication & Authorization
- ✅ Email/Password registration with OTP verification
- ✅ Email/Password login
- ✅ Google OAuth 2.0 authentication
- ✅ JWT-based session management
- ✅ Password reset via OTP
- ✅ Admin role-based access control
- ✅ Cookie consent tracking

### Email OTP System (Brevo)
- ✅ Signup OTP verification
- ✅ Password reset OTP
- ✅ HTML email templates
- ✅ Retry mechanism with exponential backoff
- ✅ OTP expiration (10 minutes)
- ✅ Rate limiting handling

### Payment Processing (Cashfree)
- ✅ Booking payment sessions
- ✅ DIY kit order payments
- ✅ Payment verification
- ✅ Webhook handling for payment events
- ✅ Refund processing
- ✅ Payment status tracking
- ✅ Support for multiple payment methods:
  - Credit Cards
  - Debit Cards
  - UPI
  - Net Banking

### Booking Management
- ✅ Create workshop bookings
- ✅ Time slot availability checking
- ✅ Booking cancellation with refunds
- ✅ Booking updates (date/time/activity changes)
- ✅ Balance payment collection for upgrades
- ✅ Automatic refund calculation for downgrades

### Order Management
- ✅ DIY kit order creation
- ✅ Order status tracking
- ✅ Delivery status updates (admin)
- ✅ Order history retrieval

### Cart Management
- ✅ Add items to cart
- ✅ Update cart quantities
- ✅ Remove items from cart
- ✅ Clear entire cart
- ✅ Persistent cart storage (Supabase)

### Admin Features
- ✅ User management
- ✅ Booking management
- ✅ Order management
- ✅ Payment tracking

## 📁 Project Structure

```
backend/
├── config/
│   ├── brevo.js          # Brevo email service configuration
│   └── supabase.js       # Supabase client initialization
├── controllers/
│   └── authController.js  # Authentication logic (legacy)
├── routes/
│   ├── auth.js           # Authentication routes (OTP, login, OAuth)
│   ├── payments.js       # Payment & booking routes
│   └── orders.js         # DIY order routes
├── scripts/
│   └── create-admin.js   # Admin user creation script
├── sql/
│   ├── add-cashfree-columns.sql
│   ├── add-cookie-consent.sql
│   ├── create-admin.sql
│   ├── create-bookings-table-cashfree.sql
│   ├── create-cart-table.sql
│   ├── create-orders-table-cashfree.sql
│   ├── create-payment-schema.sql
│   └── ...               # Additional migration scripts
├── utils/
│   ├── emailTemplates.js # HTML email templates
│   ├── generateOtp.js   # OTP generation utility
│   ├── generateToken.js # JWT token generation
│   ├── otp.js           # OTP validation & expiration
│   └── password.js      # Password hashing utilities
├── server.js            # Main server file
├── package.json
└── README.md
```

## 🔌 API Endpoints

### Authentication

#### `POST /api/auth/signup/send-otp`
Send OTP for email verification during signup.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your email",
  "expiresIn": 600
}
```

#### `POST /api/auth/signup/verify-otp`
Verify OTP for signup.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

#### `POST /api/auth/signup/complete`
Complete signup after OTP verification.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securepassword"
}
```

#### `POST /api/auth/login`
User login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt_token",
  "isAdmin": false
}
```

#### `GET /api/auth/google`
Initiate Google OAuth flow.

#### `GET /api/auth/google/callback`
Google OAuth callback handler.

#### `POST /api/auth/forgot-password/send-otp`
Send OTP for password reset.

#### `POST /api/auth/forgot-password/verify-otp`
Verify password reset OTP.

#### `POST /api/auth/forgot-password/reset`
Reset password after OTP verification.

#### `GET /api/auth/me`
Get current user information (requires JWT token).

#### `GET /api/auth/all-users`
Get all users (admin only).

### Payments & Bookings

#### `POST /api/create-order`
Create Cashfree payment session for booking.

**Request Body:**
```json
{
  "amount": 1999,
  "slotDetails": {
    "customerName": "John Doe",
    "customerEmail": "user@example.com",
    "customerPhone": "9876543210",
    "customerAddress": "123 Main St",
    "bookingDate": "2024-01-15",
    "bookingTimeSlot": "11am-1pm",
    "selectedActivities": ["Jewelry Making"],
    "participants": 1
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "KH-20240115123456-ABCD",
    "payment_session_id": "session_xxx",
    "amount": 1999,
    "currency": "INR"
  }
}
```

#### `POST /api/verify-payment`
Verify payment status.

#### `GET /api/check-payment-status/:order_id`
Check payment status for an order.

#### `POST /api/webhook`
Cashfree webhook handler (payment events).

#### `POST /api/cancel-booking/:booking_id`
Cancel booking and initiate refund.

#### `POST /api/update-booking/:booking_id`
Update booking details.

#### `GET /api/my-bookings`
Get user's bookings (requires JWT token).

#### `GET /api/all-bookings`
Get all bookings (admin only).

#### `GET /api/available-slots`
Get available time slots for an activity.

**Query Parameters:**
- `activity_name`: Activity name
- `booking_date`: Date (YYYY-MM-DD)

### DIY Orders

#### `POST /api/create-diy-order`
Create Cashfree payment session for DIY kit order.

#### `POST /api/verify-diy-payment`
Verify DIY order payment.

#### `GET /api/my-diy-orders`
Get user's DIY orders (requires JWT token).

#### `GET /api/all-diy-orders`
Get all DIY orders (admin only).

#### `GET /api/check-diy-payment-status/:order_id`
Check DIY order payment status.

#### `POST /api/update-delivery-status/:order_id`
Update delivery status (admin only).

### Cart

#### `GET /api/auth/cart`
Get user's cart (requires JWT token).

#### `POST /api/auth/cart/add`
Add item to cart.

#### `PUT /api/auth/cart/update`
Update cart item quantity.

#### `DELETE /api/auth/cart/remove`
Remove item from cart.

#### `DELETE /api/auth/cart/clear`
Clear entire cart.

### Cookie Consent

#### `GET /api/auth/cookie-consent`
Get user's cookie consent status.

#### `POST /api/auth/cookie-consent`
Update cookie consent status.

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Supabase account and project
- Brevo account and API key
- Cashfree merchant account
- Google Cloud Console project (for OAuth)

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd Know-How-Cafe-main/backend
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Frontend URL (for CORS and OAuth redirects)
FRONTEND_URL=https://www.knowhowindia.in

# Backend URL (for OAuth callbacks)
BACKEND_URL=https://knowhow-backend-d2gs.onrender.com

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters

# Brevo Email Service
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM_EMAIL=knowhowcafe2025@gmail.com
BREVO_FROM_NAME=Know How Cafe

# Cashfree Payment Gateway
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
CASHFREE_MODE=production  # or 'sandbox' for testing

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Step 4: Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL scripts in order:
   - `supabase-schema.sql` (main schema)
   - `sql/create-bookings-table-cashfree.sql`
   - `sql/create-orders-table-cashfree.sql`
   - `sql/create-cart-table.sql`
   - `sql/create-payment-schema.sql`
   - `sql/add-cashfree-columns.sql`
   - `sql/add-cookie-consent.sql`

### Step 5: Create Admin User

```bash
npm run create-admin
```

Or manually create via SQL:
```sql
-- Run sql/create-admin.sql in Supabase SQL Editor
```

### Step 6: Start Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server will start on `http://localhost:3000` (or PORT from .env)

## 🔐 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|-----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment (development/production) | Yes | - |
| `FRONTEND_URL` | Frontend URL for CORS | Yes | - |
| `BACKEND_URL` | Backend URL for OAuth callbacks | Yes | - |
| `SUPABASE_URL` | Supabase project URL | Yes | - |
| `SUPABASE_KEY` | Supabase anon/service key | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `BREVO_API_KEY` | Brevo API key | Yes | - |
| `BREVO_FROM_EMAIL` | Sender email address | No | knowhowcafe2025@gmail.com |
| `BREVO_FROM_NAME` | Sender name | No | Know How Cafe |
| `CASHFREE_APP_ID` | Cashfree App ID | Yes | - |
| `CASHFREE_SECRET_KEY` | Cashfree Secret Key | Yes | - |
| `CASHFREE_MODE` | Cashfree mode (production/sandbox) | No | production |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Yes | - |

## 🗄 Database Schema

### Main Tables

- **users**: User accounts and profiles
- **otp**: OTP codes for verification
- **login**: Login history tracking
- **bookings**: Workshop bookings
- **orders**: DIY kit orders
- **cart**: Shopping cart items
- **payments**: Payment transaction records

### Key Relationships

- `bookings.user_id` → `users.id`
- `orders.session_user_id` → `users.id`
- `cart.user_id` → `users.id`
- `payments.cashfree_order_id` → `bookings.cashfree_order_id` or `orders.cashfree_order_id`

## 🔗 Third-Party Integrations

### Brevo (Email Service)
- **Purpose**: OTP delivery for signup and password reset
- **API**: REST API v3
- **Features**: 
  - HTML email templates
  - Retry mechanism
  - Rate limit handling
- **Documentation**: https://developers.brevo.com/

### Cashfree (Payment Gateway)
- **Purpose**: Payment processing for bookings and orders
- **API Version**: 2023-08-01
- **Features**:
  - Payment session creation
  - Webhook event handling
  - Refund processing
  - Multiple payment methods
- **Documentation**: https://docs.cashfree.com/

### Google OAuth 2.0
- **Purpose**: Social authentication
- **Flow**: Authorization Code Flow
- **Scopes**: `openid email profile`
- **Documentation**: https://developers.google.com/identity/protocols/oauth2

### Supabase
- **Purpose**: PostgreSQL database and backend services
- **Features**:
  - Real-time database
  - Row Level Security (RLS)
  - RESTful API
- **Documentation**: https://supabase.com/docs

## 🚢 Deployment

### Render Deployment

1. **Connect Repository**
   - Link your GitHub repository to Render

2. **Create Web Service**
   - Service Type: Web Service
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment: Node

3. **Set Environment Variables**
   - Add all variables from `.env` file in Render dashboard
   - Ensure `NODE_ENV=production`
   - Set `BACKEND_URL` to your Render service URL

4. **Configure Health Check**
   - Health Check Path: `/health`
   - Render automatically pings this endpoint

5. **Custom Domain (Optional)**
   - Add custom domain in Render dashboard
   - Configure DNS records as per Render instructions

### Environment Variables in Render

All environment variables from `.env` must be set in Render dashboard under "Environment" section.

### Post-Deployment Checklist

- [ ] Verify health endpoint: `https://your-backend.onrender.com/health`
- [ ] Test authentication endpoints
- [ ] Verify Cashfree webhook URL is configured
- [ ] Test Google OAuth redirect URI
- [ ] Verify CORS settings allow frontend domain
- [ ] Test payment flow end-to-end

## 🔒 Security

### Implemented Security Measures

1. **JWT Authentication**
   - Token-based authentication
   - 7-day token expiration
   - Secure token storage on client

2. **Password Security**
   - bcryptjs hashing (salt rounds: 10)
   - Minimum 6 character requirement

3. **OTP Security**
   - 6-digit numeric OTP
   - 10-minute expiration
   - One-time use (marked as used after verification)

4. **CORS Protection**
   - Whitelist-based origin validation
   - Credentials support
   - Specific allowed methods and headers

5. **Input Validation**
   - Email format validation
   - Phone number format validation
   - Required field checks

6. **Webhook Security**
   - HMAC-SHA256 signature verification
   - Uses Cashfree secret key

7. **Admin Access Control**
   - Role-based access (email-based)
   - Protected admin routes

### Security Best Practices

- Never commit `.env` file
- Use strong JWT secrets (32+ characters)
- Regularly rotate API keys
- Monitor webhook signatures
- Implement rate limiting (future enhancement)
- Use HTTPS in production
- Validate all user inputs
- Sanitize database queries (Supabase handles this)

## 📝 API Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## 🧪 Testing

### Health Check
```bash
curl https://knowhow-backend-d2gs.onrender.com/health
```

### Test Authentication
```bash
# Send OTP
curl -X POST https://knowhow-backend-d2gs.onrender.com/api/auth/signup/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

## 📞 Support

For issues, questions, or contributions:
- Check existing issues in the repository
- Review API documentation
- Verify environment variables are set correctly
- Check server logs for detailed error messages

## 📄 License

[Your License Here]

---

**Built with ❤️ for Know How Cafe**
