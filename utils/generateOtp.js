/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP string
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash OTP using bcrypt (optional - for extra security)
 * In this implementation, we'll store hashed OTPs
 * @param {string} otp - Plain text OTP
 * @returns {Promise<string>} Hashed OTP
 */
async function hashOtp(otp) {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  return await bcrypt.hash(otp, saltRounds);
}

/**
 * Verify OTP against hash
 * @param {string} otp - Plain text OTP
 * @param {string} hash - Hashed OTP
 * @returns {Promise<boolean>} True if OTP matches
 */
async function verifyOtp(otp, hash) {
  const bcrypt = require('bcrypt');
  return await bcrypt.compare(otp, hash);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp
};

