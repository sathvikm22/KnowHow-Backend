# Know How Cafe Backend API

Backend server for Know How Cafe authentication system.

## Setup

1. Install dependencies:
```bash
npm install
```



**Note:** For production deployment (Render/Vercel), update:
- `FRONTEND_URL` to your Vercel domain (e.g., `https://your-app.vercel.app`)
- `BACKEND_URL` to your Render domain (e.g., `https://your-backend.onrender.com`)

3. Set up Supabase tables (see SQL schema below)

4. Run the server:
```bash
npm run dev
```

## Supabase Tables Setup

Run these SQL commands in your Supabase SQL editor:

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Login Table
```sql
CREATE TABLE IF NOT EXISTS login (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### OTP Table
```sql
CREATE TABLE IF NOT EXISTS otp (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- 'signup' or 'password_reset'
  is_used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_otp_email_purpose ON otp(email, purpose);
CREATE INDEX idx_otp_expires ON otp(expires_at);
```

## API Endpoints

### Authentication

- `POST /api/auth/signup/send-otp` - Send OTP for signup
- `POST /api/auth/signup/verify-otp` - Verify OTP for signup
- `POST /api/auth/signup/complete` - Complete signup with password
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/forgot-password/send-otp` - Send OTP for password reset
- `POST /api/auth/forgot-password/verify-otp` - Verify OTP for password reset
- `POST /api/auth/forgot-password/reset` - Reset password after OTP verification

## Environment Variables

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon key
- `BREVO_API_KEY` - Brevo API key (REQUIRED - get from https://app.brevo.com/settings/keys/api)
- `BREVO_FROM_EMAIL` - Sender email (must be verified in Brevo, default: knowhowcafe2025@gmail.com)
- `BREVO_FROM_NAME` - Sender name (default: Know How Cafe)
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)
- `BACKEND_URL` - Backend URL (default: http://localhost:3000)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` - Secret key for JWT tokens

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Configure OAuth consent screen
6. Create OAuth 2.0 Client ID (Web application)
7. Add the following:

   **Authorized JavaScript origins:**
   - `http://localhost:5173` (for local development)
   - `http://localhost:3000` (for local backend)
   - Your production frontend URL (e.g., `https://yourdomain.vercel.app`)
   - Your production backend URL (e.g., `https://your-backend.onrender.com`)

   **Authorized redirect URIs:**
   - `http://localhost:3000/api/auth/google/callback` (for local development)
   - `https://your-backend.onrender.com/api/auth/google/callback` (for production)

8. Copy the Client ID and Client Secret to your `.env` file

