const axios = require('axios');
const sgMail = require('../config/sendgrid');
const pool = require('../config/database');

class VerificationService {
  
  // Generate 6-digit OTP
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Send SMS OTP via Termii
  static async sendSMSOTP(phone, otp) {
    const message = `Your PharezAPI verification code is: ${otp}. Valid for 10 minutes.`;
    
    const payload = {
      to: phone,
      from: process.env.TERMII_SENDER_ID,
      sms: message,
      type: "plain",
      api_key: process.env.TERMII_API_KEY,
      channel: "generic"
    };

    try {
      const response = await axios.post('https://api.ng.termii.com/api/sms/send', payload);
      return response.data;
    } catch (error) {
      console.error('Termii SMS Error:', error.response?.data || error.message);
      throw new Error('Failed to send SMS');
    }
  }

  // Send Email OTP
  static async sendEmailOTP(email, otp, firstName = 'User') {
    const subject = 'Verify Your Email - PharezAPI';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Email Verification</h2>
        <p>Hello ${firstName},</p>
        <p>Please use the following code to verify your email address:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #1976d2; font-size: 32px; margin: 0;">${otp}</h1>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this verification, please ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">PharezAPI Team</p>
      </div>
    `;

    try {
      await sgMail.send({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html
      });
      console.log('✅ Email sent successfully');
    } catch (error) {
      console.error('❌ Email Error:', error.response?.body || error.message);
      throw new Error('Failed to send email');
    }
  }


  // Store OTP in database
  static async storeOTP(userId, phone, email, otp, type) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const query = `
      INSERT INTO otps (user_id, phone, email, otp_code, otp_type, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await pool.query(query, [userId, phone, email, otp, type, expiresAt]);
    return result.rows[0];
  }

  // Verify OTP
  static async verifyOTP(identifier, otp, type) {
    const query = `
      SELECT o.*, u.id as user_id, u.first_name, u.phone, u.email
      FROM otps o
      JOIN users u ON o.user_id = u.id
      WHERE (o.phone = $1 OR o.email = $1)
        AND o.otp_code = $2
        AND o.otp_type = $3
        AND o.used = false
        AND o.expires_at > NOW()
      ORDER BY o.created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [identifier, otp, type]);
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    const otpRecord = result.rows[0];

    // Mark OTP as used
    await pool.query('UPDATE otps SET used = true WHERE id = $1', [otpRecord.id]);

    return { success: true, data: otpRecord };
  }

  // Send Phone Verification
  static async sendPhoneVerification(userId, phone) {
    const otp = this.generateOTP();
    
    // Store OTP
    await this.storeOTP(userId, phone, null, otp, 'phone_verification');
    
    // Send SMS
    await this.sendSMSOTP(phone, otp);
    
    return { success: true, message: 'SMS OTP sent successfully' };
  }

  // Send Email Verification
  static async sendEmailVerification(userId, email, firstName) {
    const otp = this.generateOTP();
    
    // Store OTP
    await this.storeOTP(userId, null, email, otp, 'email_verification');
    
    // Send Email
    await this.sendEmailOTP(email, otp, firstName);
    
    return { success: true, message: 'Email OTP sent successfully' };
  }

  // Verify Phone
  static async verifyPhone(phone, otp) {
    const verification = await this.verifyOTP(phone, otp, 'phone_verification');
    
    if (!verification.success) {
      return verification;
    }

    // Update user as phone verified
    await pool.query(
      'UPDATE users SET is_phone_verified = true WHERE id = $1',
      [verification.data.user_id]
    );

    return { success: true, message: 'Phone verified successfully' };
  }

  // Verify Email
  static async verifyEmail(email, otp) {
    const verification = await this.verifyOTP(email, otp, 'email_verification');
    
    if (!verification.success) {
      return verification;
    }

    // Update user as email verified
    await pool.query(
      'UPDATE users SET is_email_verified = true WHERE id = $1',
      [verification.data.user_id]
    );

    return { success: true, message: 'Email verified successfully' };
  }
}

module.exports = VerificationService;