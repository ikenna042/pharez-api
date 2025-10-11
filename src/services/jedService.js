const axios = require('axios');
const crypto = require('crypto');
const JedCustomerRequest = require('../models/JedCustomerRequest');

class JedService {
  
  // Generate Remita API Hash
  static generateRemitaHash(merchantId, serviceTypeId, orderId, amount, apiKey) {
    const hashString = `${merchantId}${serviceTypeId}${orderId}${amount}${apiKey}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
  }

  // Call Remita Payment Init API
  static async initiateRemitaPayment(paymentData) {
    const merchantId = process.env.REMITA_MERCHANT_ID;
    const apiKey = process.env.REMITA_API_KEY;
    const serviceTypeId = process.env.REMITA_SERVICE_TYPE_ID;
    
    const orderId = Date.now().toString();
    const amount = paymentData.meterRecommended === 'Single Phase' ? process.env.SINGLE_PHASE_METER_PRICE : process.env.THREE_PHASE_METER_PRICE;
   console.log('Amount to be charged:', amount);
    
    const apiHash = this.generateRemitaHash(merchantId, serviceTypeId, orderId, amount, apiKey);

    const payload = {
      serviceTypeId,
      amount,
      orderId,
      payerName: paymentData.custNames,
      payerEmail: paymentData.email,
      payerPhone: paymentData.gsm,
      description: 'Payment for Meter'
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `remitaConsumerKey=${merchantId},remitaConsumerToken=${apiHash}`
    };

    try {
      const response = await axios.post(
        `${process.env.REMITA_BASE_URL}/merchant/api/paymentinit`,
        payload,
        { headers }
      );

      return {
        success: true,
        data: {
          ...response.data,
          orderId,
          amount
        }
      };
    } catch (error) {
      console.error('Remita API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: 'Failed to initiate payment' }
      };
    }
  }

  // Call JED Payment Confirmation API
  static async confirmPaymentWithJed(paymentData) {
    const { accountNumber, rrr, amount, orderId } = paymentData;
    
    const payload = {
      ref: rrr,
      appID: orderId,
      amount: amount,
      account: accountNumber,
      date: Math.floor(Date.now() / 1000).toString(),
      key: process.env.JED_API_KEY
    };

    try {
      const response = await axios.post(
        `${process.env.JED_BASE_URL}/payConfirmation/index.php`,
        payload
      );

      // Check for error in response
      if (response.data.err) {
        return {
          success: false,
          error: response.data.err
        };
      }

      // Successful response with PendingInstallation data
      if (response.data.PendingInstallation) {
        const pendingData = response.data.PendingInstallation;
        
        return {
          success: true,
          data: {
            accountNo: pendingData.accountNo,
            acctName: pendingData.acctName,
            applicantName: pendingData['Applicant Name'],
            address: pendingData.address,
            phone1: pendingData.phone1,
            region: pendingData.region,
            phone2: pendingData.phone2,
            area: pendingData.area,
            feeder: pendingData.feeder,
            dtName: pendingData.dtName,
            dtCode: pendingData.dtCode,
            meterType: pendingData.meterType,
            pendingSince: pendingData.pendingSince
          }
        };
      }

      return {
        success: false,
        error: 'Unexpected response format from JED'
      };
      
    } catch (error) {
      console.error('JED Payment Confirmation Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: 'Failed to confirm payment with JED' }
      };
    }
  }

  // Call JED Installation Details API
  static async sendInstallationDetailsToJed(installationData) {
    const { sealNo, meterNo, accountNumber } = installationData;
    
    const payload = {
      sealNo,
      meterNo,
      account: accountNumber,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      key: process.env.JED_API_KEY
    };

    try {
      const response = await axios.post(
        `${process.env.JED_BASE_URL}/installationDetails/index.php`,
        payload
      );

      // Check for errors
      if (response.data.err) {
        return {
          success: false,
          error: response.data.err
        };
      }

      // Check for success message
      if (response.data.Ok === 'Successful') {
        return {
          success: true,
          message: 'Installation details sent successfully'
        };
      }

      // Check for "not found" response
      if (typeof response.data === 'string' && response.data.includes('notFound')) {
        return {
          success: false,
          error: 'Customer installation stage not found in JED system'
        };
      }

      return {
        success: false,
        error: 'Unexpected response from JED'
      };
      
    } catch (error) {
      console.error('JED Installation Details Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: 'Failed to send installation details to JED' }
      };
    }
  }

  // Handle Remita webhook array and respond with plain text as Remita expects
  static async handleRemitaWebhook(remitaWebhookDto = [], res) {
    let overall_transaction_success = true;

    try {
      for (const webhook_data of remitaWebhookDto) {
        const processed = await this.processWebhook(webhook_data);
        if (!processed) overall_transaction_success = false;
      }
    } catch (error) {
      overall_transaction_success = false;
    }

    return res
      .status(200)
      .type('text/plain')
      .send(overall_transaction_success ? 'Ok' : 'Not Ok');
  }

  // Process a single Remita webhook entry
  static async processWebhook(webhook_data = {}) {
    try {
      const { rrr, orderRef } = webhook_data;

      if (!rrr) return false;

      // Check existing transaction/request
      const existing = await JedCustomerRequest.findByRrr(rrr);
      if (existing && existing.status === 'PAID') {
        return true; // already processed
      }

      // Mark as paid
      const updated = await JedCustomerRequest.markPaidByRrr(rrr, orderRef || null);
      return !!updated;
    } catch (error) {
      console.error('Error processing Remita webhook:', error.message);
      return false;
    }
  }
}

module.exports = JedService;