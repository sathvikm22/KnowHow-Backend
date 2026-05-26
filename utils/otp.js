// Generate a 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Check if OTP is expired (2 minutes = 120000 milliseconds)
export const isOTPExpired = (createdAt) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diffInMs = now - created;
  const twoMinutesInMs = 2 * 60 * 1000; // 2 minutes
  return diffInMs > twoMinutesInMs;
};

