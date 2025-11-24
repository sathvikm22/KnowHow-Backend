import axios from 'axios';
import dotenv from 'dotenv';
import { getSignupOtpTemplate, getForgotPasswordOtpTemplate } from '../utils/emailTemplates.js';

dotenv.config();

// Brevo API configuration
// Using REST API instead of SMTP to avoid Render network restrictions
const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.BREVO_SMTP_PASS;

// Log configuration
console.log('📧 Brevo API Configuration:');
console.log('  API Key:', BREVO_API_KEY ? 'SET (' + BREVO_API_KEY.substring(0, 10) + '...' + BREVO_API_KEY.length + ' chars)' : 'NOT SET');
console.log('  Using: REST API (HTTPS) - Works on Render!');

if (!BREVO_API_KEY) {
  console.error('⚠️  WARNING: Brevo API key is not configured!');
  console.error('   Please set BREVO_API_KEY in your environment variables.');
  console.error('   Get your API key from: https://app.brevo.com/settings/keys/api');
} else {
  console.log('✅ Brevo API is configured and ready to send emails');
}

/**
 * Send OTP email using Brevo REST API
 * Uses HTTPS instead of SMTP - works on Render!
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} purpose - 'verification' for signup, 'password_reset' for forgot password
 * @param {string} name - User's name (optional, for personalization)
 * @returns {Promise<{success: boolean, message?: string, error?: Error}>}
 */
const sendOTPEmail = async (toEmail, otp, purpose = 'verification', name = 'there') => {
  try {
    // Validate inputs
    if (!toEmail || !otp) {
      throw new Error('Email and OTP are required');
    }

    // Validate Brevo API key
    if (!BREVO_API_KEY) {
      const errorMsg = 'Brevo API key is not configured. Please set BREVO_API_KEY in your environment variables.';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    // Determine email subject and template based on purpose
    const subject = purpose === 'password_reset' 
      ? 'Reset Your Password - Know How Cafe' 
      : 'Verify Your Email - Know How Cafe';

    // Get appropriate HTML template
    const htmlContent = purpose === 'password_reset'
      ? getForgotPasswordOtpTemplate(otp, name)
      : getSignupOtpTemplate(otp, name);

    // Email configuration
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'knowhowcafe2025@gmail.com';
    const fromName = process.env.BREVO_FROM_NAME || 'Know How Cafe';

    console.log(`📧 Attempting to send OTP email via Brevo API to: ${toEmail}`);
    console.log(`   From: ${fromEmail}`);
    console.log(`   Purpose: ${purpose}`);

    // Brevo API endpoint
    const brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';

    // Prepare email data for Brevo API
    const emailData = {
      sender: {
        name: fromName,
        email: fromEmail
      },
      to: [
        {
          email: toEmail.toLowerCase().trim(),
          name: name || 'User'
        }
      ],
      subject: subject,
      htmlContent: htmlContent,
      textContent: `Your OTP code is: ${otp}. This code will expire in 10 minutes.`
    };

    // Send email via Brevo REST API
    const response = await axios.post(brevoApiUrl, emailData, {
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log(`✅ OTP email sent successfully to ${toEmail}`);
    console.log(`📧 Message ID: ${response.data.messageId || 'N/A'}`);
    console.log(`📧 Response status: ${response.status}`);

    return {
      success: true,
      messageId: response.data.messageId,
      response: response.data
    };

  } catch (error) {
    console.error('❌ Error sending OTP email via Brevo API:', error.message);
    
    // Log detailed error information
    if (error.response) {
      // API responded with error
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   Error Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Request made but no response
      console.error('   No response received from Brevo API');
      console.error('   Request:', error.request);
    } else {
      // Error setting up request
      console.error('   Error:', error.message);
    }
    
    // Always log OTP to console for debugging (both dev and prod)
    console.log(`\n📧 OTP for ${toEmail}: ${otp}\n`);
    console.log(`   Purpose: ${purpose}`);
    console.log(`   Time: ${new Date().toISOString()}\n`);
    
    // In development, return success with warning
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        warning: 'Email not sent, but OTP is available in console',
        error: error.message,
        otp: otp // Include OTP in response for development
      };
    }

    // In production, log detailed error but don't crash
    console.error(`\n⚠️  Email sending failed for ${toEmail}`);
    console.error(`📧 OTP (for manual verification): ${otp}`);
    
    // Return error but don't throw - allows app to continue
    return {
      success: false,
      warning: 'Email service temporarily unavailable. OTP logged to server console.',
      error: error.message,
      errorDetails: error.response?.data || error.message
    };
  }
};

// Export (no transporter needed for API)
export { sendOTPEmail };

