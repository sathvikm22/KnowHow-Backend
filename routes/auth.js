import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { sendOTPEmail } from '../config/brevo.js';
import { generateOTP, isOTPExpired } from '../utils/otp.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyAccessToken, 
  verifyRefreshToken 
} from '../utils/generateToken.js';

// Remove unused jwt import
// import jwt from 'jsonwebtoken'; // No longer needed - using generateToken utils

const router = express.Router();

// Helper function to set secure cookies
const setAuthCookies = (res, userId, email, req = null) => {
  // Detect production: Render sets RENDER env var, or check protocol
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    !!process.env.RENDER ||
    (req && req.protocol === 'https');
  
  // Generate tokens
  const accessToken = generateAccessToken({ userId, email });
  const refreshToken = generateRefreshToken(userId);
  
  // Cookie options for cross-origin requests (frontend on Vercel, backend on Render)
  // sameSite: 'none' is REQUIRED for cross-origin cookies
  // secure: true is REQUIRED when sameSite is 'none' (HTTPS only)
  // Both frontend and backend must be HTTPS
  const cookieOptions = {
    httpOnly: true,
    secure: true, // Always true - required for sameSite: 'none'
    sameSite: 'none', // Always 'none' for cross-origin (frontend and backend on different domains)
    maxAge: 10 * 60 * 1000, // 10 minutes for access token
    path: '/',
    // CRITICAL: Do NOT set domain - let browser handle it automatically
    // Setting domain can prevent cookies from working cross-origin
  };
  
  console.log('🍪 Setting cookies with options:', {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
    isProduction: isProduction,
    NODE_ENV: process.env.NODE_ENV,
    RENDER: process.env.RENDER,
    protocol: req?.protocol
  });
  
  // Set access token cookie (10 minutes)
  res.cookie('accessToken', accessToken, cookieOptions);
  console.log('✅ accessToken cookie set (length:', accessToken.length, ')');
  
  // Set refresh token cookie (7 days) - same options but longer expiry
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  console.log('✅ refreshToken cookie set (length:', refreshToken.length, ')');
  
  // Log Set-Cookie headers to verify they're being sent
  const setCookieHeaders = res.getHeader('Set-Cookie');
  console.log('📋 Set-Cookie headers:', Array.isArray(setCookieHeaders) ? setCookieHeaders.length : 'not array');
  
  return { accessToken, refreshToken };
};

// Helper function to clear auth cookies
const clearAuthCookies = (res) => {
  // Use same options as setAuthCookies for clearing
  const cookieOptions = {
    httpOnly: true,
    secure: true, // Always true (required for sameSite: 'none')
    sameSite: 'none', // Always 'none' for cross-origin
    path: '/'
  };
  
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
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

    // Set secure HttpOnly cookies (always - no cookie consent needed for security)
    setAuthCookies(res, newUser.id, newUser.email, req);

    // DO NOT return tokens in response body (security best practice)
    res.json({ 
      success: true, 
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
      // Tokens are in HttpOnly cookies only
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

    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      console.warn('⚠️  Missing email or password');
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

    if (userError) {
      console.error('❌ Database error fetching user:', userError);
      // Don't reveal if user exists or not (security)
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (!user) {
      console.warn('⚠️  User not found:', email.toLowerCase());
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    console.log('✅ User found:', user.email, 'ID:', user.id);
    console.log('🔍 Checking password...');
    console.log('   Has password field:', !!user.password);
    console.log('   Password field type:', typeof user.password);
    console.log('   Password field length:', user.password?.length);

    // Verify password
    try {
      const isPasswordValid = await comparePassword(password, user.password);
      console.log('🔐 Password comparison result:', isPasswordValid);
      
      if (!isPasswordValid) {
        console.warn('⚠️  Invalid password for user:', user.email);
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }
    } catch (compareError) {
      console.error('❌ Error comparing password:', compareError);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    console.log('✅ Password verified successfully');

    // Check if user has a valid password hash (OAuth users might have random passwords)
    // If password field is missing or empty, user might be OAuth-only
    if (!user.password || user.password.trim() === '') {
      console.warn('⚠️  User has no password set - might be OAuth-only user');
      return res.status(401).json({ 
        success: false, 
        message: 'This account was created with Google. Please use "Sign in with Google" instead.' 
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

    // Check if user is admin (knowhowcafe2025@gmail.com)
    const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';

    // Set secure HttpOnly cookies (always - security requirement)
    console.log('🍪 Setting auth cookies for user:', user.email);
    setAuthCookies(res, user.id, user.email, req);
    console.log('✅ Auth cookies set successfully');

    // DO NOT return tokens in response body (security best practice)
    res.json({ 
      success: true, 
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      isAdmin
      // Tokens are in HttpOnly cookies only
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

// Get current user (verify token from HttpOnly cookie)
router.get('/me', async (req, res) => {
  try {
    // Debug: Log cookies received
    console.log('🔍 /me endpoint called');
    console.log('   Cookies received:', Object.keys(req.cookies || {}));
    console.log('   Has accessToken:', !!req.cookies?.accessToken);
    console.log('   Request origin:', req.get('origin'));
    console.log('   Request headers:', {
      cookie: req.headers.cookie ? 'present' : 'missing',
      origin: req.get('origin'),
      referer: req.get('referer')
    });
    
    // Only get token from HttpOnly cookie (secure by design)
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      console.warn('⚠️  No access token in cookies');
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided. Please log in again.' 
      });
    }
    
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
    
    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, created_at, phone, address')
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
        name: user.name,
        phone: user.phone || null,
        address: user.address || null
      }
    });
  } catch (error) {
    console.error('Error in /me:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get all users (admin only) - uses cookie-based auth
router.get('/all-users', async (req, res) => {
  try {
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
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

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch users' 
      });
    }

    res.json({ 
      success: true, 
      users: users || []
    });
  } catch (error) {
    console.error('Error in /all-users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Refresh token endpoint with rotation
router.post('/refresh', async (req, res) => {
  try {
    // Debug: Log cookies received
    console.log('🔄 Refresh endpoint called');
    console.log('   Cookies received:', Object.keys(req.cookies || {}));
    console.log('   Has refreshToken:', !!req.cookies?.refreshToken);
    
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      console.warn('⚠️  No refresh token in cookies');
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided. Please log in again.'
      });
    }
    
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      // Clear invalid refresh token
      clearAuthCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
    
    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', decoded.userId)
      .maybeSingle();
    
    if (userError || !user) {
      clearAuthCookies(res);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Token rotation: Generate new access and refresh tokens
    // Old refresh token is invalidated by issuing a new one
    setAuthCookies(res, user.id, user.email, req);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Error in /refresh:', error);
    clearAuthCookies(res);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Logout - clear all auth cookies
router.post('/logout', async (req, res) => {
  try {
    clearAuthCookies(res);
    
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
// Remove trailing slashes to avoid issues
const removeTrailingSlash = (url) => url ? url.replace(/\/+$/, '') : url;

// Production frontend: www.knowhowindia.in only
const ALLOWED_FRONTEND_DOMAINS = [
  'https://www.knowhowindia.in',
  'https://knowhowindia.in',
];

const getFrontendUrl = (reqOrigin = null) => {
  if (process.env.FRONTEND_URL) {
    return removeTrailingSlash(process.env.FRONTEND_URL);
  }
  if (process.env.NODE_ENV === 'production' && reqOrigin) {
    const origin = removeTrailingSlash(reqOrigin);
    if (ALLOWED_FRONTEND_DOMAINS.includes(origin)) return origin;
  }
  return removeTrailingSlash(
    process.env.NODE_ENV === 'production'
      ? 'https://www.knowhowindia.in'
      : 'http://localhost:8080'
  );
};

const FRONTEND_URL_DEFAULT = getFrontendUrl();

// One-time codes for Google OAuth are stored in database (otp table)
// This ensures codes persist across server restarts and multiple instances
const GOOGLE_CODE_TTL_MS = 5 * 60 * 1000; // 5 min

// Determine backend URL - prioritize environment variable, then detect production
const getBackendUrl = () => {
  // If explicitly set, use it
  if (process.env.BACKEND_URL) {
    return removeTrailingSlash(process.env.BACKEND_URL);
  }
  
  // Detect production environment
  const isProduction = 
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER || // Render sets this automatically
    process.env.VERCEL || // Vercel sets this
    !process.env.NODE_ENV; // If not set, assume production for safety
  
  if (isProduction) {
    return 'https://knowhow-backend-d2gs.onrender.com';
  }
  
  return 'http://localhost:3000';
};

const BACKEND_URL = getBackendUrl();

// Log backend URL on startup
console.log('🔧 Backend URL Configuration:');
console.log('   BACKEND_URL:', BACKEND_URL);
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   RENDER:', process.env.RENDER || 'not set');

// Google OAuth - Initiate (redirects to Google)
router.get('/google', (req, res) => {
  try {
    console.log('🔵 Google OAuth route hit - /api/auth/google');
    console.log('   Request URL:', req.url);
    console.log('   Request method:', req.method);
    console.log('   Origin:', req.get('origin'));
    console.log('   Referer:', req.get('referer'));
    console.log('   Query params:', req.query);
    
    if (!GOOGLE_CLIENT_ID) {
      console.error('❌ Google OAuth Error: GOOGLE_CLIENT_ID is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Google OAuth is not configured. Please check your environment variables.'
      });
    }

    if (!GOOGLE_CLIENT_SECRET) {
      console.error('❌ Google OAuth Error: GOOGLE_CLIENT_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Google OAuth is not fully configured. Please check your environment variables.'
      });
    }

    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
    
    // Validate BACKEND_URL is set correctly - NEVER use localhost in production
    if (!BACKEND_URL || BACKEND_URL.includes('localhost')) {
      console.error('❌ Google OAuth Error: BACKEND_URL is using localhost!');
      console.error('   Current BACKEND_URL:', BACKEND_URL);
      console.error('   NODE_ENV:', process.env.NODE_ENV || 'not set');
      console.error('   RENDER:', process.env.RENDER || 'not set');
      console.error('   Forcing production URL...');
      
      // Force production URL if localhost detected
      const productionBackendUrl = 'https://knowhow-backend-d2gs.onrender.com';
      const productionRedirectUri = `${productionBackendUrl}/api/auth/google/callback`;
      
      console.error('   Using production URL:', productionRedirectUri);
      
      // Still return error to force environment variable setup
      return res.status(500).json({
        success: false,
        message: 'Backend URL is not configured correctly. Please set BACKEND_URL=https://knowhow-backend-d2gs.onrender.com in Render environment variables.',
        debug: {
          currentBackendUrl: BACKEND_URL,
          expectedBackendUrl: productionBackendUrl,
          redirectUri: productionRedirectUri
        }
      });
    }
    
    // Get frontend URL - priority: query param > origin/referer > env var > default
    let frontendUrl = FRONTEND_URL_DEFAULT;
    const requestOrigin = req.get('origin') || req.get('referer');
    
    // First, try query parameter (most reliable - explicitly passed from frontend)
    if (req.query.frontend_url) {
      const queryFrontendUrl = removeTrailingSlash(req.query.frontend_url);
      // Check if it's in allowed domains OR if it's a valid production URL (not localhost)
      if (ALLOWED_FRONTEND_DOMAINS.includes(queryFrontendUrl)) {
        frontendUrl = queryFrontendUrl;
        console.log('✅ Using frontend URL from query parameter:', frontendUrl);
      } else {
        console.warn('⚠️  Frontend URL from query not allowed (use www.knowhowindia.in):', queryFrontendUrl);
      }
    }
    
    // If not from query, try request origin/referer
    if (frontendUrl === FRONTEND_URL_DEFAULT || frontendUrl.includes('localhost')) {
      if (requestOrigin) {
        const originUrl = getFrontendUrl(requestOrigin);
        if (originUrl && !originUrl.includes('localhost')) {
          frontendUrl = originUrl;
          console.log('✅ Using frontend URL from request origin:', frontendUrl);
        }
      }
    }
    
    // Final check: if still localhost in production, use environment variable or default
    if (frontendUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
      if (process.env.FRONTEND_URL) {
        frontendUrl = removeTrailingSlash(process.env.FRONTEND_URL);
        console.log('✅ Using frontend URL from environment variable:', frontendUrl);
      } else {
        frontendUrl = 'https://www.knowhowindia.in';
        console.log('✅ Using production default frontend URL:', frontendUrl);
      }
    }
    
    // Store frontend URL in state parameter for callback
    const state = Buffer.from(JSON.stringify({ frontendUrl })).toString('base64');
    
    console.log('✅ Google OAuth Initiated:');
    console.log('   redirectUri (for Google):', redirectUri);
    console.log('   backendUrl:', BACKEND_URL);
    console.log('   frontendUrl:', frontendUrl);
    console.log('   requestOrigin:', requestOrigin || 'none');
    console.log('   clientId:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET');
    console.log('   ⚠️  IMPORTANT: Make sure this redirectUri is in Google Cloud Console:', redirectUri);
    
    // Double-check redirect URI is not localhost
    if (redirectUri.includes('localhost')) {
      console.error('❌ CRITICAL ERROR: Redirect URI contains localhost!');
      console.error('   This will cause OAuth to fail. Setting BACKEND_URL environment variable is required.');
      return res.status(500).json({
        success: false,
        message: 'OAuth configuration error: Backend URL must be set to production URL. Please set BACKEND_URL=https://knowhow-backend-d2gs.onrender.com in Render.',
        redirectUri: redirectUri
      });
    }

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
      `prompt=${prompt}&` +
      `state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error in Google OAuth initiation:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error during OAuth initiation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Google OAuth - Callback (handles Google redirect)
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // Try to get frontend URL from state parameter first (most reliable)
    let frontendUrl = FRONTEND_URL_DEFAULT;
    
    if (state) {
      try {
        const decodedState = Buffer.from(state, 'base64').toString();
        const stateData = JSON.parse(decodedState);
        console.log('📦 Parsed state data:', stateData);
        
        if (stateData.frontendUrl) {
          const cleanUrl = removeTrailingSlash(stateData.frontendUrl);
          if (ALLOWED_FRONTEND_DOMAINS.includes(cleanUrl)) {
            frontendUrl = cleanUrl;
            console.log('✅ Using frontend URL from state:', frontendUrl);
          } else {
            console.warn('⚠️  Frontend URL from state not in allowed domains:', cleanUrl);
          }
        }
      } catch (e) {
        console.error('❌ Error parsing state parameter:', e.message);
        console.error('   State value:', state);
      }
    }
    
    // If still using default, check if it's localhost in production (this is wrong!)
    if (frontendUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: Using localhost in production!');
      console.error('   FRONTEND_URL env var:', process.env.FRONTEND_URL);
      console.error('   FRONTEND_URL_DEFAULT:', FRONTEND_URL_DEFAULT);
      console.error('   Falling back to production default: https://www.knowhowindia.in');
      frontendUrl = 'https://www.knowhowindia.in';
    }
    
    // Also check referer header as fallback (less reliable for OAuth callbacks)
    const referer = req.get('referer');
    if (referer && frontendUrl.includes('localhost')) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (ALLOWED_FRONTEND_DOMAINS.includes(refererOrigin)) {
          frontendUrl = refererOrigin;
          console.log('✅ Using frontend URL from referer:', frontendUrl);
        }
      } catch (e) {
        // Ignore referer parsing errors
      }
    }

    console.log('🔵 Google OAuth Callback received:', {
      hasCode: !!code,
      hasError: !!error,
      error,
      backendUrl: BACKEND_URL,
      frontendUrl: frontendUrl,
      defaultFrontendUrl: FRONTEND_URL_DEFAULT,
      referer: req.get('referer'),
      origin: req.get('origin'),
      state: state ? 'present' : 'missing',
      fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
      redirectUriUsed: `${BACKEND_URL}/api/auth/google/callback`
    });
    
    // Log warning if redirect URI might be mismatched
    const expectedRedirectUri = `${BACKEND_URL}/api/auth/google/callback`;
    console.log('⚠️  IMPORTANT: Make sure this redirect URI is in Google Cloud Console:');
    console.log('   ', expectedRedirectUri);

    if (error) {
      console.error('❌ Google OAuth error received:', error);
      
      // Provide specific error messages for common issues
      let errorMessage = 'oauth_failed';
      if (error === 'access_denied') {
        errorMessage = 'access_denied';
      } else if (error === 'redirect_uri_mismatch') {
        errorMessage = 'redirect_uri_mismatch';
        console.error('⚠️  CRITICAL: Redirect URI mismatch!');
        console.error('   Expected redirect URI:', `${BACKEND_URL}/api/auth/google/callback`);
        console.error('   Make sure this exact URL is in Google Cloud Console → Credentials → Authorized redirect URIs');
      }
      
      return res.redirect(`${frontendUrl}/login?error=${errorMessage}`);
    }

    if (!code) {
      console.error('❌ Google OAuth: No authorization code received');
      console.error('   This usually means Google did not redirect properly');
      console.error('   Check that the redirect URI in Google Cloud Console matches:', `${BACKEND_URL}/api/auth/google/callback`);
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth: Missing credentials in environment variables');
      return res.redirect(`${frontendUrl}/login?error=oauth_not_configured`);
    }

    // Exchange authorization code for tokens
    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
    console.log('🔄 Exchanging code for tokens with redirect_uri:', redirectUri);
    
    let tokenResponse;
    try {
      tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
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
    } catch (tokenError) {
      console.error('❌ Token exchange failed:', tokenError.response?.data || tokenError.message);
      if (tokenError.response?.data?.error === 'invalid_grant') {
        console.error('   This usually means the authorization code has expired or was already used');
        return res.redirect(`${frontendUrl}/login?error=code_expired`);
      } else if (tokenError.response?.data?.error === 'redirect_uri_mismatch') {
        console.error('   ⚠️  Redirect URI mismatch in token exchange!');
        console.error('   Make sure this exact URL is in Google Cloud Console:', redirectUri);
        return res.redirect(`${frontendUrl}/login?error=redirect_uri_mismatch`);
      }
      return res.redirect(`${frontendUrl}/login?error=token_exchange_failed`);
    }

    const { access_token, id_token } = tokenResponse.data;

    if (!access_token || !id_token) {
      return res.redirect(`${frontendUrl}/login?error=token_exchange_failed`);
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
      return res.redirect(`${frontendUrl}/login?error=no_email`);
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
        return res.redirect(`${frontendUrl}/login?error=user_creation_failed`);
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

    // Check if user is admin
    const isAdmin = user.email.toLowerCase() === 'knowhowcafe2025@gmail.com';

    // Use one-time code flow: cookies set in redirect-to-other-origin are often
    // not stored by browsers. Redirect with code; frontend exchanges it via POST
    // and we set cookies in that response (reliably stored).
    // Store code in database (not memory) to handle Render cold starts / multiple instances.
    const authCode = crypto.randomBytes(32).toString('hex');
    
    // Clean up expired Google OAuth codes
    await supabase
      .from('otp')
      .delete()
      .eq('purpose', 'google_oauth')
      .lt('expires_at', new Date().toISOString());
    
    // Store the one-time code in database
    const { error: codeError } = await supabase
      .from('otp')
      .insert({
        email: user.email.toLowerCase(),
        otp_code: authCode,
        purpose: 'google_oauth',
        expires_at: new Date(Date.now() + GOOGLE_CODE_TTL_MS).toISOString()
      });
    
    if (codeError) {
      console.error('Error storing Google OAuth code:', codeError);
      return res.redirect(`${frontendUrl}/login?error=oauth_code_failed`);
    }

    const redirectUrl = `${frontendUrl}/auth/google/callback?code=${authCode}`;
    console.log('=== Google OAuth Success ===');
    console.log('User authenticated:', user.email);
    console.log('Redirecting to frontend with one-time code');
    console.log('===========================');
    res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    // Use default frontend URL for error redirects
    res.redirect(`${FRONTEND_URL_DEFAULT}/login?error=oauth_callback_failed`);
  }
});

// Exchange one-time code for session (sets cookies in API response; avoids redirect cookie issues)
router.post('/google/complete', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing or invalid code' });
    }
    
    // Look up code in database
    const { data: codeData, error: codeError } = await supabase
      .from('otp')
      .select('email, expires_at')
      .eq('otp_code', code)
      .eq('purpose', 'google_oauth')
      .maybeSingle();
    
    if (codeError || !codeData) {
      console.warn('Google OAuth code not found:', code.substring(0, 10) + '...');
      return res.status(401).json({ success: false, message: 'Invalid or expired code. Please sign in again.' });
    }
    
    // Check expiration
    if (new Date(codeData.expires_at) < new Date()) {
      // Delete expired code
      await supabase.from('otp').delete().eq('otp_code', code).eq('purpose', 'google_oauth');
      return res.status(401).json({ success: false, message: 'Code expired. Please sign in again.' });
    }
    
    // Delete the code (one-time use)
    await supabase.from('otp').delete().eq('otp_code', code).eq('purpose', 'google_oauth');
    
    // Look up user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, phone, address')
      .eq('email', codeData.email.toLowerCase())
      .maybeSingle();
    
    if (userError || !user) {
      console.error('User not found for Google OAuth:', codeData.email);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Set auth cookies
    setAuthCookies(res, user.id, user.email, req);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || null,
        address: user.address || null
      }
    });
  } catch (e) {
    console.error('Google complete error:', e);
    res.status(500).json({ success: false, message: 'Failed to complete sign-in' });
  }
});

// Get user's cookie consent status
router.get('/cookie-consent', async (req, res) => {
  try {
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
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
    const accessToken = req.cookies?.accessToken;
    const { consent } = req.body; // 'accepted' or 'declined'
    
    if (!accessToken) {
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
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const userEmail = decoded.email;

    // Get user to check if they have a token
    const { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('id, email, cookie_consent')
      .eq('email', userEmail.toLowerCase())
      .single();

    if (userFetchError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

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

    const isProduction = process.env.NODE_ENV === 'production';

    // Always set secure cookies regardless of consent (security requirement)
    // Cookie consent is for analytics/tracking, not authentication security
    if (consent === 'accepted') {
      // Set secure auth cookies
      setAuthCookies(res, user.id, user.email, req);
    } else if (consent === 'declined') {
      // Still set auth cookies for security, but user can opt out of tracking
      // Authentication cookies are essential for security
      setAuthCookies(res, user.id, user.email, req);
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
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
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
    const accessToken = req.cookies?.accessToken;
    const { kitName, price, quantity = 1 } = req.body;
    
    if (!accessToken) {
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
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
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
    const accessToken = req.cookies?.accessToken;
    const { kitName, quantity } = req.body;
    
    if (!accessToken) {
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

    // Verify token and get user email
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const userEmail = decoded.email;

    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
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
    const accessToken = req.cookies?.accessToken;
    const { kitName } = req.body;
    
    if (!accessToken) {
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
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
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
    const accessToken = req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token and get user email
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
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

