# Backend Setup Guide

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

## Step 2: Set Up Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Supabase Configuration
SUPABASE_URL=SUPABASE_URL
SUPABASE_SERVICE_ROLE=SUPABASE_SERVICE_ROLE

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Resend API Key
RESEND_API_KEY=re_dKtxB5wM_2ufYsCpNgGFRxUaVWnuvkp5N

# Google OAuth (for future implementation)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
```

**Important:** Replace `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` with your actual Supabase credentials.

## Step 3: Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `setup.sql`
4. Run the SQL script

This will create the required tables:
- `users` - User accounts
- `login_logs` - Login history
- `otps` - OTP codes for verification

## Step 4: Configure Resend Email

1. The Resend API key is already set in the `.env` example
2. Update the `from` email address in `controllers/authController.js`:
   - Replace `'Know How Cafe <onboarding@resend.dev>'` with your verified domain
   - Example: `'Know How Cafe <noreply@yourdomain.com>'`

## Step 5: Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## Step 6: Test the API

You can test the health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Frontend Integration

Make sure your frontend `.env` file includes:

```env
VITE_API_URL=http://localhost:5000
```

Or update `src/lib/api.ts` to use the correct backend URL.

## Troubleshooting

### CORS Errors
- Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check that `withCredentials: true` is set in frontend API calls

### Database Errors
- Verify Supabase credentials are correct
- Ensure all tables are created (check Supabase dashboard)
- Check table names match exactly (case-sensitive)

### Email Not Sending
- Verify Resend API key is correct
- Check sender email is verified in Resend dashboard
- Update the `from` field in authController.js

### Token Issues
- Ensure `JWT_SECRET` is set and is a strong random string
- Check token expiry settings match your requirements

