import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { getSignupOtpTemplate, getForgotPasswordOtpTemplate } from '../utils/emailTemplates.js';

dotenv.config();

// Brevo SMTP configuration
const brevoConfig = {
  host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.BREVO_SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.BREVO_SMTP_USER || process.env.BREVO_API_KEY?.split('-')[0] + '@smtp-brevo.com' || '9c4c2e001@smtp-brevo.com',
    pass: process.env.BREVO_SMTP_PASS || process.env.BREVO_API_KEY || '4KAWYxSaz20Ls8Bd'
  },
  // Add connection timeout settings for Render
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
  // Retry configuration
  pool: true,
  maxConnections: 1,
  maxMessages: 3
};

// Create reusable transporter
const transporter = nodemailer.createTransport(brevoConfig);

// Verify transporter configuration (non-blocking, with timeout)
// Don't block server startup if SMTP verification fails
const verifyTransporter = () => {
  transporter.verify(function (error, success) {
    if (error) {
      console.error('⚠️  Brevo SMTP configuration error:', error.message);
      console.error('⚠️  Email functionality may not work. Check your Brevo credentials and network settings.');
      // In production, don't crash - email will fail gracefully
      if (process.env.NODE_ENV === 'production') {
        console.log('ℹ️  Server will continue running. Email sending will be attempted but may fail.');
      }
    } else {
      console.log('✅ Brevo SMTP server is ready to send emails');
    }
  });
};

// Only verify in development or if explicitly enabled
// On Render, SMTP connections can timeout, so we skip verification on startup
if (process.env.NODE_ENV !== 'production' || process.env.VERIFY_SMTP === 'true') {
  // Use setTimeout to make it non-blocking
  setTimeout(verifyTransporter, 1000);
}

/**
 * Send OTP email using Brevo SMTP
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

    // Determine email subject and template based on purpose
    const subject = purpose === 'password_reset' 
      ? 'Reset Your Password - Know How Cafe' 
      : 'Verify Your Email - Know How Cafe';

    // Get appropriate HTML template
    const htmlContent = purpose === 'password_reset'
      ? getForgotPasswordOtpTemplate(otp, name)
      : getSignupOtpTemplate(otp, name);

    // Email options
    const mailOptions = {
      from: 'Know How Cafe <knowhowcafe2025@gmail.com>',
      to: toEmail.toLowerCase().trim(),
      subject: subject,
      html: htmlContent
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ OTP email sent successfully to ${toEmail}`);
    console.log(`📧 Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    
    // In development, log OTP to console for testing
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📧 OTP for ${toEmail}: ${otp}\n`);
      return {
        success: true,
        warning: 'Email not sent, but OTP is available in console',
        error: error.message
      };
    }

    // In production, if SMTP fails, log OTP to console as fallback
    // This allows the app to continue working even if email service is down
    if (process.env.NODE_ENV === 'production') {
      console.error(`\n⚠️  Email sending failed for ${toEmail}`);
      console.error(`📧 OTP (for manual verification): ${otp}`);
      console.error(`Error: ${error.message}`);
      
      // Return a warning instead of throwing - allows app to continue
      return {
        success: false,
        warning: 'Email service temporarily unavailable. OTP logged to server console.',
        error: error.message
      };
    }

    // In other cases, throw error
    throw error;
  }
};

export { sendOTPEmail, transporter };

