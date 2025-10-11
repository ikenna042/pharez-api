const JedCustomerRequest = require('../models/JedCustomerRequest');
const JedService = require('../services/jedService');
const { asyncHandler } = require('../middleware/errorHandler');

const handleRemitaWebhook = asyncHandler(async (req, res) => {
  // Remita sends an array of payment notifications
  const paymentNotifications = req.body;

  if (!Array.isArray(paymentNotifications)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid payload format. Expected an array of payment notifications'
    });
  }

  const results = [];

  for (const payment of paymentNotifications) {
    try {
      const { 
        rrr, 
        amount, 
        transactiondate, 
        debitdate,
        orderId,
        orderRef,
        payerName,
        payerPhoneNumber,
        payerEmail,
        channel,
        type
      } = payment;

      // Validate required fields
      if (!rrr) {
        results.push({
          rrr: rrr || 'unknown',
          success: false,
          message: 'RRR is required'
        });
        continue;
      }

      // Only process successful payments (type: PY = Payment)
      if (type !== 'PY') {
        results.push({
          rrr,
          success: false,
          message: `Transaction type ${type} not processed. Only 'PY' (Payment) is accepted`
        });
        continue;
      }

      // Find customer request by RRR
      const customerRequest = await JedCustomerRequest.findByRRR(rrr);

      if (!customerRequest) {
        results.push({
          rrr,
          success: false,
          message: `No customer request found for RRR: ${rrr}`
        });
        continue;
      }

      // Check if already paid
      if (customerRequest.status === 'PAID' || customerRequest.status === 'COMPLETED') {
        results.push({
          rrr,
          accountNumber: customerRequest.accountNumber,
          success: false,
          message: `Payment already confirmed for RRR: ${rrr}`,
          currentStatus: customerRequest.status
        });
        continue;
      }

      // Verify amount matches
      if (parseFloat(amount) !== parseFloat(customerRequest.amount)) {
        results.push({
          rrr,
          accountNumber: customerRequest.accountNumber,
          success: false,
          message: `Amount mismatch. Expected: ${customerRequest.amount}, Received: ${amount}`
        });
        continue;
      }

      // Call JED to confirm payment
      const jedResponse = await JedService.confirmPaymentWithJed({
        accountNumber: customerRequest.accountNumber,
        rrr: customerRequest.rrr,
        amount: customerRequest.amount,
        orderId: customerRequest.orderId
      });

      if (!jedResponse.success) {
        results.push({
          rrr,
          accountNumber: customerRequest.accountNumber,
          success: false,
          message: 'Failed to confirm payment with JED',
          error: jedResponse.error
        });
        continue;
      }

      // Update customer request with JED response data
      const updatedRequest = await JedCustomerRequest.updatePaymentDetails(
        customerRequest.accountNumber,
        jedResponse.data
      );

      // Log webhook payment details
      await JedCustomerRequest.logWebhookPayment(customerRequest.accountNumber, {
        rrr,
        amount,
        transactionDate: transactiondate,
        debitDate: debitdate,
        channel,
        payerName,
        payerPhoneNumber,
        payerEmail,
        orderRef
      });

      results.push({
        rrr,
        accountNumber: updatedRequest.accountNumber,
        success: true,
        message: 'Payment confirmed successfully via webhook',
        status: updatedRequest.status,
        jedConfirmed: true
      });

    } catch (error) {
      console.error(`Error processing payment notification for RRR ${payment.rrr}:`, error);
      results.push({
        rrr: payment.rrr,
        success: false,
        message: error.message
      });
    }
  }

  // Return 200 to Remita even if some failed (Remita expects 200 for webhook acknowledgment)
  res.status(200).json({
    success: true,
    message: 'Webhook processed',
    totalNotifications: paymentNotifications.length,
    processed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  });
});

const verifyRemitaPayment = asyncHandler(async (req, res) => {
  const { rrr } = req.params;

  if (!rrr) {
    return res.status(400).json({
      success: false,
      message: 'RRR is required'
    });
  }

  // Find customer request by RRR
  const customerRequest = await JedCustomerRequest.findByRRR(rrr);

  if (!customerRequest) {
    return res.status(404).json({
      success: false,
      message: `No customer request found for RRR: ${rrr}`
    });
  }

  res.json({
    success: true,
    data: {
      rrr: customerRequest.rrr,
      accountNumber: customerRequest.accountNumber,
      custNames: customerRequest.custNames,
      amount: customerRequest.amount,
      status: customerRequest.status,
      dateRequested: customerRequest.dateRequested,
      datePaid: customerRequest.datePaid,
      orderRef: customerRequest.orderId
    }
  });
});

module.exports = {
  handleRemitaWebhook,
  verifyRemitaPayment
};