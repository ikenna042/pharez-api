const axios = require('axios');
const crypto = require('crypto');
const JedCustomerRequest = require('../models/JedCustomerRequest');
const MeterType = require('../models/MeterType');

class JedService {
  
  // Generate Remita API Hash
  static generateRemitaHash(merchantId, serviceTypeId, orderId, amount, apiKey) {
    const hashString = `${merchantId}${serviceTypeId}${orderId}${amount}${apiKey}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
  }

  // Call Remita Payment Init API
  static async initiateRemitaPayment(paymentData) {
    console.log('HTTP_PROXY:', process.env.HTTP_PROXY, process.env.HTTPS_PROXY, process.env.http_proxy, process.env.https_proxy);
    const merchantId = process.env.REMITA_MERCHANT_ID;
    const apiKey = process.env.REMITA_API_KEY;
    const serviceTypeId = process.env.REMITA_SERVICE_TYPE_ID;
    const meterTypesData = await MeterType.findAll();
    console.log('Fetched Meter Types:', meterTypesData);
    const orderId = Date.now().toString();

    const selectedPhase = meterTypesData.meterTypes.find(phase => 
      phase.name.toLowerCase() === paymentData.meterRecommended.toLowerCase()
    );

    let amount;
    if (selectedPhase) {
      amount = selectedPhase.amount;
    } else {
      // Handle the case where no match is found (e.g., set a default or throw an error)
      console.error(`Error: No price found for phase: ${paymentData.meterRecommended}`);
      return {
        success: false,
        error: 'Failed to initiate payment'
      };
    }
    console.log('Amount to be charged:', amount);
    console.log('Generating Remita hash with:', { merchantId, serviceTypeId, orderId, amount, apiKey });
    
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
        { headers, maxRedirects: 0 }
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
  static async confirmPaymentWithJed(paymentData, source = 'MANUAL') {
    const { accountNumber, rrr, amount, orderId } = paymentData;
    const date = new Date().toISOString().split('T')[0];
    
    const payload = {
      ref: rrr,
      appID: orderId,
      amount: amount,
      account: accountNumber,
      date,
      key: process.env.JED_API_KEY
    };

    console.log('Sending payment confirmation to JED with payload:', payload);

    try {
      const response = await axios.post(
        `${process.env.JED_BASE_URL}/payConfirmation/index.php`,
        payload
      );

      console.log('JED Payment Confirmation Response:', response.data);

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

        // update the JedCustomerRequest record with the confirmed payment details
        await JedCustomerRequest.updatePaymentConfirmation(accountNumber, {
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
        });
        
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
      const { rrr, orderId } = webhook_data;

      // log webhook data for debugging
      console.log('Received Remita webhook data:', webhook_data);

      if (!rrr) return false;

      // Check existing transaction/request
      const existing = await JedCustomerRequest.findByRRR(rrr);

      if (!existing) {
        console.error('No existing transaction found for RRR:', rrr);
        return false;
      }
      
      // call logWebhookPaymentByRRR to log the webhook data
      await JedCustomerRequest.logWebhookPaymentByRRR(rrr, webhook_data);

      if (existing.status === 'COMPLETED' || existing.status === 'PAID') {
        console.log('Transaction already marked as completed or paid:', rrr);
        return true; // already processed
      }

      // Call JED to confirm payment
      const jedResponse = await this.confirmPaymentWithJed({
        accountNumber: existing.accountNumber,
        rrr,
        amount: existing.amount,
        orderId: existing.orderId
      });

      // Log the request and response for debugging
      console.log('JED Payment Confirmation Request Data:', {
        accountNumber: existing.accountNumber,
        rrr,
        amount: existing.amount,
        orderId: existing.orderId
      });
      console.log('JED Payment Confirmation Response:', jedResponse);
      
      if (!jedResponse.success) {
        console.error('Failed to confirm payment with JED:', jedResponse.error);
        return false;
      }

      // Mark as paid
      const updated = await JedCustomerRequest.markPaidByRRR(rrr, webhook_data);
      return !!updated;
    } catch (error) {
      console.error('Error processing Remita webhook:', error.message);
      return false;
    }
  }

// Generate status-check hash (different formula from payment-init hash)
  static generateStatusHash(value, apiKey, merchantId) {
    const hashString = `${value}${apiKey}${merchantId}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
  }

  // Check Remita transaction status by RRR
  static async checkRemitaStatusByRrr(rrr) {
    const merchantId = process.env.REMITA_MERCHANT_ID;
    const apiKey = process.env.REMITA_API_KEY;

    const apiHash = this.generateStatusHash(rrr, apiKey, merchantId);
    const url = `${process.env.REMITA_BASE_URL}/${merchantId}/${rrr}/${apiHash}/status.reg`;

    try {
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `remitaConsumerKey=${merchantId},remitaConsumerToken=${apiHash}`
        }
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error('Remita Status Check (RRR) Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: 'Failed to check transaction status by RRR' }
      };
    }
  }

  // Check Remita transaction status by orderId
  static async checkRemitaStatusByOrderId(orderId) {
    const merchantId = process.env.REMITA_MERCHANT_ID;
    const apiKey = process.env.REMITA_API_KEY;

    const apiHash = this.generateStatusHash(orderId, apiKey, merchantId);
    const url = `${process.env.REMITA_BASE_URL}/${merchantId}/${orderId}/${apiHash}/orderstatus.reg`;

    try {
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `remitaConsumerKey=${merchantId},remitaConsumerToken=${apiHash}`
        }
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error('Remita Status Check (orderId) Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: 'Failed to check transaction status by orderId' }
      };
    }
  }

  // Manually confirm payment by RRR (mirrors processWebhook but returns detailed result)
  static async confirmPaymentManuallyByRrr(rrr) {
    try {
      // 1. Check existing transaction/request
      const existing = await JedCustomerRequest.findByRRR(rrr);

      if (!existing) {
        return {
          success: false,
          statusCode: 404,
          message: `No request found for RRR ${rrr}`
        };
      }

      if (existing.status === 'COMPLETED' || existing.status === 'PAID') {
        return {
          success: false,
          statusCode: 400,
          message: `Request already ${existing.status.toLowerCase()} for RRR ${rrr}`,
          data: existing
        };
      }

      // 2. Call JED to confirm payment
      const jedResponse = await this.confirmPaymentWithJed({
        accountNumber: existing.accountNumber,
        rrr,
        amount: existing.amount,
        orderId: existing.orderId
      });

      // Log the request and response for debugging
      console.log('JED Payment Confirmation Request Data:', {
        accountNumber: existing.accountNumber,
        rrr,
        amount: existing.amount,
        orderId: existing.orderId
      });
      console.log('JED Payment Confirmation Response:', jedResponse);

      if (!jedResponse.success) {
        console.error('Failed to confirm payment with JED:', jedResponse.error);
        return {
          success: false,
          statusCode: 502,
          message: 'Failed to confirm payment with JED',
          error: jedResponse.error
        };
      }

      // 3. Mark as paid
      const updated = await JedCustomerRequest.markPaidByRRR(rrr, {
        manualConfirmation: true,
        confirmedAt: new Date().toISOString()
      });

      if (!updated) {
        return {
          success: false,
          statusCode: 500,
          message: 'Payment confirmed with JED but failed to update request status'
        };
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Payment confirmed successfully',
        data: {
          request: updated,
          pendingInstallation: jedResponse.data
        }
      };
    } catch (error) {
      console.error('Error manually confirming payment:', error.message);
      return {
        success: false,
        statusCode: 500,
        message: 'Failed to manually confirm payment',
        error: error.message
      };
    }
  }

  // Reconcile pending (INITIATED) requests against Remita's status API.
  // For any confirmed as paid, complete the same confirm+mark flow as the manual endpoint.
  static async reconcilePendingPayments() {
    const summary = { checked: 0, confirmed: 0, stillPending: 0, failed: 0, errors: [] };

    let pendingRequests;
    try {
      pendingRequests = await JedCustomerRequest.findInitiatedWithRrr();
    } catch (error) {
      console.error('Reconcile job: failed to fetch pending requests:', error.message);
      summary.errors.push({ stage: 'fetch', message: error.message });
      return summary;
    }

    console.log(`Reconcile job: found ${pendingRequests.length} pending request(s) to check`);

    for (const request of pendingRequests) {
      summary.checked++;

      try {
        const statusResponse = await this.checkRemitaStatusByRrr(request.rrr);

        if (!statusResponse.success) {
          console.error(`Reconcile job: status check failed for RRR ${request.rrr}:`, statusResponse.error);
          summary.failed++;
          summary.errors.push({ rrr: request.rrr, stage: 'status_check', error: statusResponse.error });
          continue;
        }

        const remitaStatus = statusResponse.data?.status;

        // '00' and '01' denote successful/paid transactions per Remita docs
        if (remitaStatus === '00' || remitaStatus === '01') {
          console.log(`Reconcile job: RRR ${request.rrr} confirmed paid by Remita, completing confirmation`);

          const confirmResult = await this.confirmPaymentManuallyByRrr(request.rrr);

          if (confirmResult.success) {
            summary.confirmed++;
          } else {
            console.error(`Reconcile job: failed to complete confirmation for RRR ${request.rrr}:`, confirmResult.message);
            summary.failed++;
            summary.errors.push({ rrr: request.rrr, stage: 'confirm', message: confirmResult.message });
          }
        } else {
          // Still pending, or a non-success status (e.g. '021' pending) — skip for now
          summary.stillPending++;
        }
      } catch (error) {
        console.error(`Reconcile job: unexpected error for RRR ${request.rrr}:`, error.message);
        summary.failed++;
        summary.errors.push({ rrr: request.rrr, stage: 'unexpected', message: error.message });
      }

      // Small delay between calls to avoid hammering Remita/JED
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('Reconcile job: summary', summary);
    return summary;
  }

}

module.exports = JedService;