const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const { sendOTPEmail } = require('../config/brevo');
const { generateOtp, hashOtp, verifyOtp } = require('../utils/generateOtp');
const { generateToken } = require('../utils/generateToken');

/**
 * Send OTP for signup
 * POST /auth/send-otp
 */
async function sendSignupOtp(req, res) {
  try {
    const { email, name } = req.body;

    // Validate input
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // Set expiry (10 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Store OTP in database (upsert - replace if exists)
    const { error: otpError } = await supabase
      .from('otps')
      .upsert({
        email: email.toLowerCase(),
        otp: hashedOtp,
        type: 'signup',
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'email,type'
      });

    if (otpError) {
      console.error('Error storing OTP:', otpError);
      return res.status(500).json({
        success: false,
        message: 'Failed to store OTP'
      });
    }

    // Send OTP email
    try {
      const emailResult = await sendOTPEmail(email, otp, 'verification', name);
      
      if (!emailResult.success) {
        console.error('Error sending email:', emailResult.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP email'
        });
      }
    } catch (emailErr) {
      console.error('Email sending error:', emailErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email'
      });
    }

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });
  } catch (error) {
    console.error('Error in sendSignupOtp:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Verify OTP for signup
 * POST /auth/verify-otp
 */
async function verifySignupOtp(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Get stored OTP from database
    const { data: otpData, error: otpError } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('type', 'signup')
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Check if OTP has expired
    const expiresAt = new Date(otpData.expires_at);
    if (new Date() > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    // Verify OTP
    const isValid = await verifyOtp(otp, otpData.otp);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // OTP is valid - delete it from database
    await supabase
      .from('otps')
      .delete()
      .eq('email', email.toLowerCase())
      .eq('type', 'signup');

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Error in verifySignupOtp:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Complete signup with password
 * POST /auth/signup
 */
async function completeSignup(req, res) {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and password are required'
      });
    }

    // Validate password strength (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        full_name: name,
        password_hash: passwordHash
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user account'
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.full_name
    }, '30d'); // 30 days expiry

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Set to true in production with HTTPS
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.full_name
      }
    });
  } catch (error) {
    console.error('Error in completeSignup:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Login user
 * POST /auth/login
 */
async function login(req, res) {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
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
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Create login log entry
    await supabase
      .from('login_logs')
      .insert({
        email: user.email,
        method: 'email'
      });

    // Set token expiry based on rememberMe
    const expiresIn = rememberMe ? '30d' : '2h';
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.full_name
    }, expiresIn);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Set to true in production with HTTPS
      maxAge: maxAge
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Send OTP for forgot password
 * POST /auth/forgot/send-otp
 */
async function sendForgotPasswordOtp(req, res) {
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
      .select('email, full_name')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return res.json({
        success: true,
        message: 'If an account exists with this email, an OTP has been sent'
      });
    }

    // Generate OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // Set expiry (10 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Store OTP in database
    const { error: otpError } = await supabase
      .from('otps')
      .upsert({
        email: email.toLowerCase(),
        otp: hashedOtp,
        type: 'forgot_pass',
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'email,type'
      });

    if (otpError) {
      console.error('Error storing OTP:', otpError);
      return res.status(500).json({
        success: false,
        message: 'Failed to store OTP'
      });
    }

    // Send OTP email
    try {
      const emailResult = await sendOTPEmail(email, otp, 'password_reset', user.full_name);
      
      if (!emailResult.success) {
        console.error('Error sending email:', emailResult.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP email'
        });
      }
    } catch (emailErr) {
      console.error('Email sending error:', emailErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email'
      });
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, an OTP has been sent'
    });
  } catch (error) {
    console.error('Error in sendForgotPasswordOtp:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Verify OTP for forgot password
 * POST /auth/forgot/verify-otp
 */
async function verifyForgotPasswordOtp(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Get stored OTP from database
    const { data: otpData, error: otpError } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('type', 'forgot_pass')
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Check if OTP has expired
    const expiresAt = new Date(otpData.expires_at);
    if (new Date() > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    // Verify OTP
    const isValid = await verifyOtp(otp, otpData.otp);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // OTP is valid - delete it from database
    await supabase
      .from('otps')
      .delete()
      .eq('email', email.toLowerCase())
      .eq('type', 'forgot_pass');

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Error in verifyForgotPasswordOtp:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Reset password after OTP verification
 * POST /auth/forgot/reset-password
 */
async function resetPassword(req, res) {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user exists
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
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
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
    console.error('Error in resetPassword:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Get current user
 * GET /auth/me
 */
async function getCurrentUser(req, res) {
  try {
    // User is attached to req by authenticateToken middleware
    const userId = req.user.id;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, created_at')
      .eq('id', userId)
      .single();

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
        name: user.full_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Logout user
 * POST /auth/logout
 */
async function logout(req, res) {
  try {
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false
    });

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
}

/**
 * Google OAuth - Initiate
 * GET /auth/google
 */
async function googleOAuth(req, res) {
  // Placeholder for Google OAuth implementation
  // TODO: Implement Google OAuth flow
  res.json({
    success: false,
    message: 'Google OAuth is not yet implemented. This is a placeholder endpoint.'
  });
}

/**
 * Google OAuth - Callback
 * GET /auth/google/callback
 */
async function googleOAuthCallback(req, res) {
  // Placeholder for Google OAuth callback
  // TODO: Implement Google OAuth callback
  res.json({
    success: false,
    message: 'Google OAuth callback is not yet implemented. This is a placeholder endpoint.'
  });
}

module.exports = {
  sendSignupOtp,
  verifySignupOtp,
  completeSignup,
  login,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  getCurrentUser,
  logout,
  googleOAuth,
  googleOAuthCallback
};

