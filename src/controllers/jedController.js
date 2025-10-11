const JedCustomerRequest = require('../models/JedCustomerRequest');
const Meter = require('../models/Meter');
const JedService = require('../services/jedService');
const { asyncHandler } = require('../middleware/errorHandler');

// Generate payment reference (RRR) via Remita and create a JED customer request
const generateRef = asyncHandler(async (req, res) => {
  const {
    accountNumber,
    custNames,
    gsm,
    email,
    address,
    meterRecommended,
    discoCode,
    requestRef,
    region,
    amount
  } = req.body;

  if (!accountNumber || !custNames || !gsm || !email) {
    return res.status(400).json({ success: false, message: 'accountNumber, custNames, gsm and email are required' });
  }

  // Check if request already exists
  const existingRequest = await JedCustomerRequest.findByAccountNumber(accountNumber);

    if (existingRequest) {
        return res.status(400).json({
        success: false,
        message: `Request already exists for account number ${accountNumber}`,
        data: {
            rrr: existingRequest.rrr,
            status: existingRequest.status,
            accountNumber: existingRequest.accountNumber
        }
        });
    }

  // Initiate Remita payment
  const remitaResponse = await JedService.initiateRemitaPayment({ custNames, email, gsm, amount, meterRecommended });
  console.log(remitaResponse);
  if (!remitaResponse.success) {
    return res.status(502).json({ success: false, message: 'Failed to generate payment reference', error: remitaResponse.error });
  }

  // Function to convert response to normal JSON
function convertToNormalJSON(response) {
  try {
    // Step 1: Reconstruct the JSONP string
    let resBody = '';
    for (let key in response.data) {
      if (!isNaN(key)) {
        resBody += response.data[key];
      } else {
        break; // Stop at non-numeric keys like orderId
      }
    }

    // Step 2: Remove the 'jsonp (' prefix and ')' suffix
    if (resBody.startsWith('jsonp (')) {
      resBody = resBody.substring(7, resBody.length - 1);
    }

    // Step 3: Parse the JSONP string
    const parsedData = JSON.parse(resBody);

    // Step 4: Create a new JSON object with top-level fields and parsed data
    const normalJSON = {
      success: response.success,
      ...parsedData, // Spread the parsed JSONP data (statuscode, RRR, status)
      orderId: response.data.orderId,
      amount: response.data.amount
    };

    return normalJSON;
  } catch (error) {
    console.error('Error converting to JSON:', error.message);
    return null;
  }
}

  const paymentData = convertToNormalJSON(remitaResponse) || {};
  console.log('Converted Payment Data:', paymentData);

  // Persist request
  const created = await JedCustomerRequest.create({
    accountNumber,
    custNames,
    gsm,
    email,
    address,
    meterRecommended,
    discoCode,
    requestRef,
    region,
    rrr: paymentData.RRR || null,
    amount: paymentData.amount || amount || null,
    orderId: paymentData.orderId || null,
    appId: paymentData.orderId || null
  });

  return res.status(201).json({
    success: true,
    message: 'Payment reference generated successfully',
    data: {
      accountNumber: created.accountNumber,
      rrr: created.rrr,
      orderId: created.orderId,
      amount: created.amount
    }
  });
});

// Confirm payment with JED and update the request with pending installation data
const confirmPayment = asyncHandler(async (req, res) => {
  const { accountNumber } = req.body;

  // Find the customer request
  const customerRequest = await JedCustomerRequest.findByAccountNumber(accountNumber);
  
  if (!customerRequest) {
    return res.status(404).json({
      success: false,
      message: `No request found for account number ${accountNumber}`
    });
  }

  // Check if already paid
  if (customerRequest.status === 'PAID' || customerRequest.status === 'COMPLETED') {
    return res.status(400).json({
      success: false,
      message: `Payment already confirmed for account number ${accountNumber}`,
      data: {
        status: customerRequest.status,
        datePaid: customerRequest.datePaid
      }
    });
  }

  // Call JED to confirm payment
  const jedResponse = await JedService.confirmPaymentWithJed({
    accountNumber: customerRequest.accountNumber,
    rrr: customerRequest.rrr,
    amount: customerRequest.amount,
    orderId: customerRequest.orderId
  });

  if (!jedResponse.success) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send installation details to JED',
      error: jedResponse.error
    });
  }

  // Update customer request with installation details
  const updatedRequest = await JedCustomerRequest.updateInstallationDetails(
    accountNumber,
    { sealNo, meterNo }
  );

  // Update meter status to INSTALLED
  await Meter.updateStatus(meterNo, 'INSTALLED');

  res.json({
    success: true,
    message: 'Installation completed successfully',
    data: {
      accountNumber: updatedRequest.accountNumber,
      sealNo: updatedRequest.sealNo,
      meterNo: updatedRequest.meterNo,
      status: updatedRequest.status,
      dateCompleted: updatedRequest.dateCompleted
    }
  });
});

// Complete installation: verify meter, check status, send installation details to JED and update DB
const completeInstallation = asyncHandler(async (req, res) => {
  const { sealNo, meterNo, accountNumber } = req.body;

  // Find the customer request
  const customerRequest = await JedCustomerRequest.findByAccountNumber(accountNumber);
  
  if (!customerRequest) {
    return res.status(404).json({
      success: false,
      message: `No request found for account number ${accountNumber}`
    });
  }

  // Check if payment is confirmed
  if (customerRequest.status !== 'PAID') {
    return res.status(400).json({
      success: false,
      message: `Payment not confirmed for account number ${accountNumber}. Current status: ${customerRequest.status}`
    });
  }

  // Check if already completed
  if (customerRequest.status === 'COMPLETED') {
    return res.status(400).json({
      success: false,
      message: `Installation already completed for account number ${accountNumber}`,
      data: {
        sealNo: customerRequest.sealNo,
        meterNo: customerRequest.meterNo,
        dateCompleted: customerRequest.dateCompleted
      }
    });
  }

  // Verify meter exists and type matches
  const meter = await Meter.findByMeterNo(meterNo);
  
  if (!meter) {
    return res.status(404).json({
      success: false,
      message: `Meter number ${meterNo} not found in system`
    });
  }

  // Validate meter type matches recommendation
  const meterTypeMatch = 
    (customerRequest.meterRecommended === 'Single Phase' && meter.meterType === 'Single Phase') ||
    (customerRequest.meterRecommended === 'Three Phase' && meter.meterType === 'Three Phase');

  if (!meterTypeMatch) {
    return res.status(400).json({
      success: false,
      message: `Meter type mismatch. Required: ${customerRequest.meterRecommended}, Provided: ${meter.meterType}`
    });
  }

  // Check meter availability
  if (meter.status !== 'AVAILABLE') {
    return res.status(400).json({
      success: false,
      message: `Meter ${meterNo} is not available. Current status: ${meter.status}`
    });
  }

  // Send installation details to JED
  const jedResponse = await JedService.sendInstallationDetailsToJed({
    sealNo,
    meterNo,
    accountNumber
  });

  if (!jedResponse.success) {
    return res.status(502).json({ 
        success: false, 
        message: 'Failed to send installation details to JED', 
        error: jedResponse.error 
    });
  }

  // Update DB: mark meter installed and update request
  const updatedMeter = await Meter.updateStatus(meterNo, 'INSTALLED');
  const updatedRequest = await JedCustomerRequest.updateInstallationDetails(accountNumber, { sealNo, meterNo });

  return res.json({
    success: true,
    message: 'Installation completed successfully',
    data: {
      request: updatedRequest,
      meter: updatedMeter
    }
  });
});

const getRequest = asyncHandler(async (req, res) => {
  const { accountNumber } = req.params;
  if (!accountNumber) {
    return res.status(400).json({ success: false, message: 'accountNumber is required' });
  }

  const customerRequest = await JedCustomerRequest.findByAccountNumber(accountNumber);
  if (!customerRequest) {
    return res.status(404).json({ success: false, message: `No request found for account number ${accountNumber}` });
  }

  return res.json({ success: true, data: customerRequest });
});

const getAllRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const result = await JedCustomerRequest.findAll({ page: Number(page), limit: Number(limit), status });
  return res.json({ success: true, data: result.requests, pagination: result.pagination });
});

const getRequestsByStatus = asyncHandler(async (req, res) => {
  const { status } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const validStatuses = ['INITIATED', 'PAID', 'COMPLETED'];
  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const result = await JedCustomerRequest.findAll({ page: Number(page), limit: Number(limit), status: status.toUpperCase() });
  return res.json({ success: true, data: result.requests, pagination: result.pagination });
});

// Remita webhook handler — expects an array of webhook objects and replies with plain text
const remitaWebhook = asyncHandler(async (req, res) => {
  // Remita may send JSON array in body; ensure we pass correct payload
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  return JedService.handleRemitaWebhook(payload, res);
});

module.exports = {
  generateRef,
  confirmPayment,
  completeInstallation,
  getRequest,
  getAllRequests,
  getRequestsByStatus,
  remitaWebhook
};