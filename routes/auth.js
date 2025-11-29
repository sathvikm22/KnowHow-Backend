import express from 'express';
import axios from 'axios';
import { supabase } from '../config/supabase.js';
import { sendOTPEmail } from '../config/brevo.js';
import { generateOTP, isOTPExpired } from '../utils/otp.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate JWT token
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// Send OTP for signup
router.post('/signup/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and name are required' 
      });
    }

    // Check if user already exists
    const { data: existingUser, error: userCheckError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle(); // Use maybeSingle() to avoid error when no record found

    if (existingUser) {
      console.log(`⚠️  Signup attempt with existing email: ${email}`);
      return res.status(400).json({ 
        success: false, 
        message: 'This email address is already registered. Please use a different email or try logging in instead.' 
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing OTPs for this email
    await supabase
      .from('otp')
      .delete()
      .eq('email', email.toLowerCase())
      .eq('purpose', 'signup');

    // Store OTP in database
    const { error: otpError } = await supabase
      .from('otp')
      .insert({
        email: email.toLowerCase(),
        otp_code: otp,
        purpose: 'signup',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes from now
      });

    if (otpError) {
      console.error('Error storing OTP:', otpError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate OTP' 
      });
    }

    // Send OTP via email
    const emailResult = await sendOTPEmail(email, otp, 'verification', name);
    
    // Log result
    if (emailResult.success) {
      console.log(`✅ Email sent successfully to ${email}`);
      console.log(`📧 Message ID: ${emailResult.messageId || 'N/A'}`);
    } else {
      console.error(`❌ Email failed for ${email}:`, emailResult.error);
      console.error(`📧 Error Type: ${emailResult.errorType || 'Unknown'}`);
      // Always log OTP to console for manual verification
      console.log(`📧 OTP for ${email} (manual verification): ${otp}`);
    }

    // Return appropriate response based on email success
    if (emailResult.success) {
      // Email sent successfully
      res.json({ 
        success: true, 
        message: 'OTP sent to your email',
        expiresIn: 600 // 10 minutes in seconds
      });
    } else {
      // Email failed - still return success but with warning
      // OTP is stored in DB, so user can still verify if they check server logs
      const response = {
        success: true, // Still true because OTP is generated and stored
        message: emailResult.warning || 'OTP generated but email delivery failed. Please check server logs or contact support.',
        expiresIn: 600,
        emailSent: false,
        errorType: emailResult.errorType || 'Unknown'
      };

      // In development, include OTP in response for testing
      if (process.env.NODE_ENV === 'development') {
        response.otp = otp;
        response.debug = 'Email not sent. OTP included for testing.';
        response.error = emailResult.error;
      }

      res.json(response);
    }
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Verify OTP for signup
router.post('/signup/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and OTP are required' 
      });
    }

    // Get the OTP from database
    const { data: otpData, error: otpError } = await supabase
      .from('otp')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('purpose', 'signup')
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired OTP' 
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(otpData.created_at)) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (otpData.otp_code !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Mark OTP as used
    await supabase
      .from('otp')
      .update({ is_used: true })
      .eq('id', otpData.id);

    res.json({ 
      success: true, 
      message: 'OTP verified successfully',
      verified: true
    });
  } catch (error) {
    console.error('Error in verify-otp:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Complete signup (after OTP verification)
router.post('/signup/complete', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, name, and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if email was verified (OTP was used)
    const { data: verifiedOtp } = await supabase
      .from('otp')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('purpose', 'signup')
      .eq('is_used', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!verifiedOtp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please verify your email first' 
      });
    }

    // Check if user already exists (double-check before creating account)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle(); // Use maybeSingle() to avoid error when no record found

    if (existingUser) {
      console.log(`⚠️  Complete signup attempt with existing email: ${email}`);
      return res.status(400).json({ 
        success: false, 
        message: 'This email address is already registered. Please use a different email or try logging in instead.' 
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        name: name,
        password: hashedPassword,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create account' 
      });
    }

    // Create login record
    await supabase
      .from('login')
      .insert({
        user_id: newUser.id,
        email: email.toLowerCase(),
        login_time: new Date().toISOString(),
        ip_address: req.ip || 'unknown'
      });

    // Generate JWT token
    const token = generateToken(newUser.id, newUser.email);

    res.json({ 
      success: true, 
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      },
      token
    });
  } catch (error) {
    console.error('Error in complete-signup:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Create login record
    await supabase
      .from('login')
      .insert({
        user_id: user.id,
        email: user.email,
        login_time: new Date().toISOString(),
        ip_address: req.ip || 'unknown'
      });

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    // Check if user is admin (knowhowcafe2025@gmail.com)
    const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';

    res.json({ 
      success: true, 
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token,
      isAdmin
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Send OTP for password reset
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    // Check if user exists
    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', email.toLowerCase())
      .maybeSingle(); // Use maybeSingle() to avoid error when no record found

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ 
        success: true, 
        message: 'If an account exists with this email, an OTP has been sent' 
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing OTPs for this email
    await supabase
      .from('otp')
      .delete()
      .eq('email', email.toLowerCase())
      .eq('purpose', 'password_reset');

    // Store OTP in database
    const { error: otpError } = await supabase
      .from('otp')
      .insert({
        email: email.toLowerCase(),
        otp_code: otp,
        purpose: 'password_reset',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes from now
      });

    if (otpError) {
      console.error('Error storing OTP:', otpError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate OTP' 
      });
    }

    // Send OTP via email
    const emailResult = await sendOTPEmail(email, otp, 'password_reset', user.name || 'there');
    
    // Log result
    if (emailResult.success) {
      console.log(`✅ Password reset email sent successfully to ${email}`);
      console.log(`📧 Message ID: ${emailResult.messageId || 'N/A'}`);
    } else {
      console.error(`❌ Password reset email failed for ${email}:`, emailResult.error);
      console.error(`📧 Error Type: ${emailResult.errorType || 'Unknown'}`);
      // Always log OTP to console for manual verification
      console.log(`📧 Password Reset OTP for ${email} (manual verification): ${otp}`);
    }

    // Return appropriate response based on email success
    if (emailResult.success) {
      // Email sent successfully
      res.json({ 
        success: true, 
        message: 'If an account exists with this email, an OTP has been sent',
        expiresIn: 600 // 10 minutes in seconds
      });
    } else {
      // Email failed - still return success but with warning
      // OTP is stored in DB, so user can still verify if they check server logs
      const response = {
        success: true, // Still true because OTP is generated and stored
        message: emailResult.warning || 'OTP generated but email delivery failed. Please check server logs or contact support.',
        expiresIn: 600,
        emailSent: false,
        errorType: emailResult.errorType || 'Unknown'
      };

      // In development, include OTP in response for testing
      if (process.env.NODE_ENV === 'development') {
        response.otp = otp;
        response.debug = 'Email not sent. OTP included for testing.';
        response.error = emailResult.error;
      }

      res.json(response);
    }
  } catch (error) {
    console.error('Error in forgot-password send-otp:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Verify OTP for password reset
router.post('/forgot-password/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and OTP are required' 
      });
    }

    // Get the OTP from database
    const { data: otpData, error: otpError } = await supabase
      .from('otp')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('purpose', 'password_reset')
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired OTP' 
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(otpData.created_at)) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (otpData.otp_code !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Mark OTP as used
    await supabase
      .from('otp')
      .update({ is_used: true })
      .eq('id', otpData.id);

    res.json({ 
      success: true, 
      message: 'OTP verified successfully',
      verified: true
    });
  } catch (error) {
    console.error('Error in forgot-password verify-otp:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Reset password (after OTP verification)
router.post('/forgot-password/reset', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if email was verified (OTP was used)
    const { data: verifiedOtp } = await supabase
      .from('otp')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('purpose', 'password_reset')
      .eq('is_used', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!verifiedOtp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please verify your email first' 
      });
    }

    // Check if OTP was verified recently (within last 10 minutes)
    const otpVerifiedAt = new Date(verifiedOtp.updated_at);
    const now = new Date();
    const diffInMs = now - otpVerifiedAt;
    const tenMinutesInMs = 10 * 60 * 1000;

    if (diffInMs > tenMinutesInMs) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP verification expired. Please request a new one.' 
      });
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to reset password' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get current user (verify token and return user info)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Get user from database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name, created_at')
        .eq('id', decoded.userId)
        .maybeSingle();

      if (userError || !user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      res.json({ 
        success: true, 
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (tokenError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
  } catch (error) {
    console.error('Error in /me:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Logout (client-side token removal, but endpoint for consistency)
router.post('/logout', async (req, res) => {
  try {
    // Since we're using JWT tokens stored client-side,
    // logout is mainly handled by removing the token on the client.
    // This endpoint can be used for server-side session cleanup if needed.
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Error in logout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Get URLs from environment variables with production defaults
// For Render backend: https://knowhow-backend.onrender.com
// For Vercel frontend: https://know-how-frontend.vercel.app, https://know-how-frontend-rosy.vercel.app, https://www.knowhowindia.in, https://knowhowindia.in
const FRONTEND_URL = process.env.FRONTEND_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://know-how-frontend.vercel.app' 
    : 'http://localhost:8080'); // Frontend runs on port 8080 (see vite.config.ts)
const BACKEND_URL = process.env.BACKEND_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://knowhow-backend.onrender.com' 
    : 'http://localhost:3000');

// Google OAuth - Initiate (redirects to Google)
router.get('/google', (req, res) => {
  console.log('🔵 Google OAuth route hit - /api/auth/google');
  console.log('   Request URL:', req.url);
  console.log('   Request method:', req.method);
  console.log('   Headers:', req.headers);
  
  if (!GOOGLE_CLIENT_ID) {
    console.error('❌ Google OAuth Error: GOOGLE_CLIENT_ID is not set in environment variables');
    return res.status(500).json({
      success: false,
      message: 'Google OAuth is not configured. Please check your environment variables.'
    });
  }

  const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
  console.log('✅ Google OAuth Initiated:', {
    redirectUri,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
    clientId: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET'
  });

  const scope = 'openid email profile';
  const responseType = 'code';
  const accessType = 'offline';
  const prompt = 'consent';

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=${responseType}&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=${accessType}&` +
    `prompt=${prompt}`;

  res.redirect(authUrl);
});

// Google OAuth - Callback (handles Google redirect)
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    console.log('Google OAuth Callback received:', {
      hasCode: !!code,
      hasError: !!error,
      error,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL
    });

    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }

    if (!code) {
      console.error('Google OAuth: No authorization code received');
      return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth: Missing credentials in environment variables');
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_not_configured`);
    }

    // Exchange authorization code for tokens
    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
    console.log('Exchanging code for tokens with redirect_uri:', redirectUri);
    
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, id_token } = tokenResponse.data;

    if (!access_token || !id_token) {
      return res.redirect(`${FRONTEND_URL}/login?error=token_exchange_failed`);
    }

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const googleUser = userInfoResponse.data;
    const { email, name, picture } = googleUser;

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Check if user exists in database
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    let user;
    let isNewUser = false;

    if (existingUser) {
      // User exists - update if needed
      user = existingUser;
      
      // Update name if it changed
      if (name && name !== existingUser.name) {
        const { data: updatedUser } = await supabase
          .from('users')
          .update({ name: name })
          .eq('id', existingUser.id)
          .select()
          .single();
        
        if (updatedUser) {
          user = updatedUser;
        }
      }
    } else {
      // New user - create account
      isNewUser = true;
      // Generate a random password hash for OAuth users (they'll never use it)
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      const passwordHash = await hashPassword(randomPassword);
      
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          name: name || 'Google User',
          password: passwordHash,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
        return res.redirect(`${FRONTEND_URL}/login?error=user_creation_failed`);
      }

      user = newUser;
    }

    // Create login record
    await supabase
      .from('login')
      .insert({
        user_id: user.id,
        email: user.email,
        login_time: new Date().toISOString(),
        ip_address: req.ip || 'unknown'
      });

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    // Check if user is admin
    const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';

    // Redirect to frontend with token
    // Use HTTP 302 redirect (standard for OAuth callbacks)
    try {
      const redirectUrl = new URL(`${FRONTEND_URL}/auth/google/callback`);
      redirectUrl.searchParams.set('token', token);
      redirectUrl.searchParams.set('email', user.email);
      redirectUrl.searchParams.set('name', user.name || 'User');
      if (isAdmin) {
        redirectUrl.searchParams.set('isAdmin', 'true');
      }
      if (isNewUser) {
        redirectUrl.searchParams.set('newUser', 'true');
      }

      const finalUrl = redirectUrl.toString();
      console.log('=== Google OAuth Success ===');
      console.log('User authenticated:', user.email);
      console.log('Redirecting to frontend:', finalUrl);
      console.log('Frontend URL:', FRONTEND_URL);
      console.log('Token length:', token.length);
      console.log('===========================');

      // Use HTTP 302 redirect (temporary redirect)
      // This is the standard way to handle OAuth callbacks
      res.redirect(302, finalUrl);
    } catch (urlError) {
      console.error('Error constructing redirect URL:', urlError);
      // Fallback: redirect with query string manually
      const fallbackUrl = `${FRONTEND_URL}/auth/google/callback?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || 'User')}${isAdmin ? '&isAdmin=true' : ''}${isNewUser ? '&newUser=true' : ''}`;
      console.log('Using fallback redirect URL:', fallbackUrl);
      res.redirect(302, fallbackUrl);
    }

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_callback_failed`);
  }
});

// Get user's cookie consent status
router.get('/cookie-consent', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user's cookie consent status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('cookie_consent')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      cookieConsent: user.cookie_consent || null // null, 'accepted', or 'declined'
    });
  } catch (error) {
    console.error('Error getting cookie consent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user's cookie consent status
router.post('/cookie-consent', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { consent } = req.body; // 'accepted' or 'declined'
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!consent || !['accepted', 'declined'].includes(consent)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid consent value. Must be "accepted" or "declined"'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Update user's cookie consent status
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        cookie_consent: consent,
        cookie_consent_date: new Date().toISOString()
      })
      .eq('email', userEmail.toLowerCase())
      .select()
      .single();

    if (updateError) {
      console.error('Error updating cookie consent:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update cookie consent'
      });
    }

    res.json({
      success: true,
      message: `Cookie consent ${consent} successfully`,
      cookieConsent: consent
    });
  } catch (error) {
    console.error('Error updating cookie consent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ==================== CART ENDPOINTS ====================

// Get user's cart
router.get('/cart', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get cart items
    const { data: cartItems, error: cartError } = await supabase
      .from('cart')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (cartError) {
      console.error('Error fetching cart:', cartError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch cart'
      });
    }

    res.json({
      success: true,
      cart: cartItems || []
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Add item to cart
router.post('/cart/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { kitName, price, quantity = 1 } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!kitName || !price) {
      return res.status(400).json({
        success: false,
        message: 'Kit name and price are required'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if item already exists in cart
    const { data: existingItem } = await supabase
      .from('cart')
      .select('*')
      .eq('user_id', user.id)
      .eq('kit_name', kitName)
      .maybeSingle();

    if (existingItem) {
      // Update quantity
      const { data: updatedItem, error: updateError } = await supabase
        .from('cart')
        .update({
          quantity: existingItem.quantity + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating cart item:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update cart item'
        });
      }

      return res.json({
        success: true,
        message: 'Cart item updated',
        cartItem: updatedItem
      });
    } else {
      // Insert new item
      const { data: newItem, error: insertError } = await supabase
        .from('cart')
        .insert({
          user_id: user.id,
          kit_name: kitName,
          price: price,
          quantity: quantity
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error adding to cart:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Failed to add item to cart'
        });
      }

      return res.json({
        success: true,
        message: 'Item added to cart',
        cartItem: newItem
      });
    }
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update cart item quantity
router.put('/cart/update', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { kitName, quantity } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!kitName || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Kit name and quantity are required'
      });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or less - call remove endpoint logic
      const userEmail = decoded.email;
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle();

      if (user) {
        await supabase
          .from('cart')
          .delete()
          .eq('user_id', user.id)
          .eq('kit_name', kitName);
      }
      return res.json({
        success: true,
        message: 'Item removed from cart'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update cart item
    const { data: updatedItem, error: updateError } = await supabase
      .from('cart')
      .update({
        quantity: quantity,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('kit_name', kitName)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating cart item:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update cart item'
      });
    }

    res.json({
      success: true,
      message: 'Cart item updated',
      cartItem: updatedItem
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Remove item from cart
router.delete('/cart/remove', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { kitName } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!kitName) {
      return res.status(400).json({
        success: false,
        message: 'Kit name is required'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete cart item
    const { error: deleteError } = await supabase
      .from('cart')
      .delete()
      .eq('user_id', user.id)
      .eq('kit_name', kitName);

    if (deleteError) {
      console.error('Error removing from cart:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to remove item from cart'
      });
    }

    res.json({
      success: true,
      message: 'Item removed from cart'
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Clear entire cart
router.delete('/cart/clear', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const userEmail = decoded.email;

    // Get user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete all cart items
    const { error: deleteError } = await supabase
      .from('cart')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error clearing cart:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to clear cart'
      });
    }

    res.json({
      success: true,
      message: 'Cart cleared'
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;

