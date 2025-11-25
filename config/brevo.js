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
// Email validation helper
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sendOTPEmail = async (toEmail, otp, purpose = 'verification', name = 'there') => {
  try {
    // Validate inputs
    if (!toEmail || !otp) {
      throw new Error('Email and OTP are required');
    }

    // Validate email format
    if (!isValidEmail(toEmail)) {
      throw new Error(`Invalid email format: ${toEmail}`);
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

    // Validate sender email
    if (!isValidEmail(fromEmail)) {
      throw new Error(`Invalid sender email format: ${fromEmail}. Please set BREVO_FROM_EMAIL to a valid email address.`);
    }

    // Check if sender email is verified in Brevo (common issue)
    // Note: This is just a warning, Brevo will reject if not verified
    if (fromEmail.includes('gmail.com') && !process.env.BREVO_FROM_EMAIL) {
      console.warn('⚠️  Warning: Using Gmail address as sender. Make sure this email is verified in your Brevo account.');
      console.warn('   Unverified sender emails may be rejected by Brevo.');
    }

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

    // Send email via Brevo REST API with retry mechanism
    let lastError = null;
    const maxRetries = 2;
    let response = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📧 Attempt ${attempt}/${maxRetries} to send email to ${toEmail}`);
        
        response = await axios.post(brevoApiUrl, emailData, {
          headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        });

        // Success - break out of retry loop
        break;
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error (429) or server error (5xx) - retry these
        const shouldRetry = error.response && (
          error.response.status === 429 || // Rate limit
          error.response.status >= 500 || // Server error
          error.response.status === 408 // Timeout
        );

        if (shouldRetry && attempt < maxRetries) {
          const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s
          console.log(`⚠️  Retryable error on attempt ${attempt}. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          // Non-retryable error or max retries reached
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to send email after retries');
    }

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
    let errorType = 'Unknown';
    let errorMessage = error.message;
    
    if (error.response) {
      // API responded with error
      const status = error.response.status;
      const errorData = error.response.data;
      
      console.error('   Status:', status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   Error Data:', JSON.stringify(errorData, null, 2));
      
      // Categorize common Brevo errors
      if (status === 429) {
        errorType = 'Rate Limit';
        errorMessage = 'Email service rate limit exceeded. Please try again in a few minutes.';
      } else if (status === 400) {
        errorType = 'Invalid Request';
        errorMessage = errorData?.message || 'Invalid email request. Check sender email configuration.';
      } else if (status === 401 || status === 403) {
        errorType = 'Authentication';
        errorMessage = 'Email service authentication failed. Check API key configuration.';
      } else if (status >= 500) {
        errorType = 'Server Error';
        errorMessage = 'Email service temporarily unavailable. Please try again later.';
      } else {
        errorType = 'API Error';
        errorMessage = errorData?.message || `Email service error (${status})`;
      }
    } else if (error.request) {
      // Request made but no response
      errorType = 'Network Error';
      errorMessage = 'No response received from email service. Check network connection.';
      console.error('   No response received from Brevo API');
      console.error('   Request timeout or network issue');
    } else {
      // Error setting up request
      errorType = 'Request Error';
      console.error('   Error:', error.message);
    }
    
    // Always log OTP to console for debugging (both dev and prod)
    console.log(`\n📧 OTP for ${toEmail}: ${otp}\n`);
    console.log(`   Purpose: ${purpose}`);
    console.log(`   Error Type: ${errorType}`);
    console.log(`   Time: ${new Date().toISOString()}\n`);
    
    // In development, return success with warning
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        warning: 'Email not sent, but OTP is available in console',
        error: errorMessage,
        errorType: errorType,
        otp: otp // Include OTP in response for development
      };
    }

    // In production, log detailed error but don't crash
    console.error(`\n⚠️  Email sending failed for ${toEmail}`);
    console.error(`📧 OTP (for manual verification): ${otp}`);
    console.error(`📧 Error Type: ${errorType}`);
    
    // Return error but don't throw - allows app to continue
    return {
      success: false,
      warning: 'Email service temporarily unavailable. OTP logged to server console.',
      error: errorMessage,
      errorType: errorType,
      errorDetails: error.response?.data || error.message
    };
  }
};

// Export (no transporter needed for API)
export { sendOTPEmail };

