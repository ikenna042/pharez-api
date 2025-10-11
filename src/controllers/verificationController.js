const VerificationService = require('../services/verificationService');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

const sendPhoneOTP = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const phone = req.user.phone;

  console.log('User Info:', req.user); // Debugging line

  // Check if already verified
  if (req.user.isPhoneVerified) {
    return res.status(400).json({
      success: false,
      message: 'Phone already verified'
    });
  }
  console.log('User ID:', userId, 'Phone:', phone); // Debugging line

  const result = await VerificationService.sendPhoneVerification(userId, phone);
  console.log('Verification Service Result:', result); // Debugging line

  if (!result.success) {
    return res.status(500).json(result);
  }

  res.json({
    success: true,
    message: 'SMS OTP sent to your phone number'
  });
});

const verifyPhoneOTP = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const phone = req.user.phone;

  console.log('Verifying OTP:', otp, 'for Phone:', phone); // Debugging line

  const result = await VerificationService.verifyPhone(phone, otp);
  console.log('Verify Phone Result:', result); // Debugging line

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({
    success: true,
    message: 'Phone verified successfully'
  });
});

const sendEmailOTP = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const email = req.user.email;
  const firstName = req.user.firstName;

  // Check if already verified
  if (req.user.isEmailVerified) {
    return res.status(400).json({
      success: false,
      message: 'Email already verified'
    });
  }

  const result = await VerificationService.sendEmailVerification(userId, email, firstName);

  res.json({
    success: true,
    message: 'Email OTP sent to your email address'
  });
});

const verifyEmailOTP = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const email = req.user.email;

  const result = await VerificationService.verifyEmail(email, otp);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
});

module.exports = {
  sendPhoneOTP,
  verifyPhoneOTP,
  sendEmailOTP,
  verifyEmailOTP
};