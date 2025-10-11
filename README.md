# JED Integration Module Guide

Complete guide for the JED meter installation and payment integration module.

## Overview

The JED integration module handles the complete workflow for meter installation requests, payment processing via Remita, and installation completion notifications to JED.

## Workflow

```
1. Generate Payment Reference (Remita) → Status: INITIATED
2. Confirm Payment (JED) → Status: PAID
3. Complete Installation (JED) → Status: COMPLETED
```

## Setup Instructions

### 1. Run JED Migration

```bash
npm run migrate:jed
```

This creates:
- `jed_customer_request` table
- `meters` table
- Required indexes and triggers

### 2. Seed Sample Meters (Optional)

```bash
npm run seed:meters
```

This creates:
- 10 Single Phase meters (SP000000000001 - SP000000000010)
- 10 Three Phase meters (TP000000000001 - TP000000000010)

### 3. Update Environment Variables

Ensure your `.env` file has:

```env
# Remita Configuration
REMITA_BASE_URL=https://demo.remita.net/remita/exapp/api/v1/send/api/echannelsvc
REMITA_MERCHANT_ID=2547916
REMITA_API_KEY=1946
REMITA_SERVICE_TYPE_ID=4430731

# JED Configuration
JED_BASE_URL=https://jedecosystem.com/map/api
JED_API_KEY=9338f470319b36b3c269d7971dd12050
```

## API Endpoints

All JED endpoints are under `/api/v1/external/jed` and **DO NOT require authentication**.

### 1. Generate Payment Reference

**Endpoint:** `POST /api/v1/external/jed/generate-ref`

**Description:** Creates a customer request and generates a Remita RRR for payment.

**Request Body:**
```json
{
  "accountNumber": "477014",
  "custNames": "ABUTU AUGUSTINE",
  "gsm": "+2348036233685",
  "email": "customer@example.com",
  "address": "UPHILLS BRIGHTWAY RUKUBA ROAD",
  "meterRecommended": "Three Phase",
  "discoCode": "JED001",
  "requestRef": "REF123456",
  "region": "DILIMI"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Payment reference generated successfully",
  "data": {
    "statuscode": "025",
    "RRR": "120799142825",
    "status": "Payment Reference generated",
    "gateway": "Remita",
    "accountNumber": "477014",
    "amount": "10000",
    "orderId": "1633177984000"
  }
}
```

**Error Response (400) - Duplicate:**
```json
{
  "success": false,
  "message": "Request already exists for account number 477014",
  "data": {
    "rrr": "120799142825",
    "status": "INITIATED",
    "accountNumber": "477014"
  }
}
```

### 2. Confirm Payment

**Endpoint:** `POST /api/v1/external/jed/confirm-payment`

**Description:** Confirms payment with JED after customer pays via Remita and retrieves installation details.

**Request Body:**
```json
{
  "accountNumber": "477014"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment confirmed successfully",
  "data": {
    "accountNumber": "477014",
    "status": "PAID",
    "pendingInstallation": {
      "applicantName": "ABUTU AUGUSTINE",
      "address": "UPHILLS BRIGHTWAY RUKUBA ROAD",
      "phone1": "008036233685",
      "phone2": null,
      "area": "DILIMI",
      "feeder": "RUKUBA ROAD",
      "dtCode": "JO-01-53-5B-75-07",
      "meterType": "Three Phase",
      "pendingSince": "2019-10-02T13:53:04.000Z"
    }
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "No request found for account number 477014"
}
```

**Error Response (400) - Already Paid:**
```json
{
  "success": false,
  "message": "Payment already confirmed for account number 477014",
  "data": {
    "status": "PAID",
    "datePaid": "2024-10-10T14:30:00.000Z"
  }
}
```

### 3. Complete Installation

**Endpoint:** `POST /api/v1/external/jed/complete-installation`

**Description:** Sends installation details to JED and marks the request as completed.

**Request Body:**
```json
{
  "sealNo": "9900",
  "meterNo": "TP000000000001",
  "accountNumber": "477014"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Installation completed successfully",
  "data": {
    "accountNumber": "477014",
    "sealNo": "9900",
    "meterNo": "TP000000000001",
    "status": "COMPLETED",
    "dateCompleted": "2024-10-10T15:45:00.000Z"
  }
}
```

**Error Response (400) - Payment Not Confirmed:**
```json
{
  "success": false,
  "message": "Payment not confirmed for account number 477014. Current status: INITIATED"
}
```

**Error Response (404) - Meter Not Found:**
```json
{
  "success": false,
  "message": "Meter number TP000000000001 not found in system"
}
```

**Error Response (400) - Meter Type Mismatch:**
```json
{
  "success": false,
  "message": "Meter type mismatch. Required: Three Phase, Provided: Single Phase"
}
```

**Error Response (400) - Meter Not Available:**
```json
{
  "success": false,
  "message": "Meter TP000000000001 is not available. Current status: INSTALLED"
}
```

### 4. Get Single Request

**Endpoint:** `GET /api/v1/external/jed/requests/{accountNumber}`

**Description:** Retrieve a single customer request by account number.

**Example:** `GET /api/v1/external/jed/requests/477014`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "accountNumber": "477014",
    "custNames": "ABUTU AUGUSTINE",
    "gsm": "+2348036233685",
    "email": "customer@example.com",
    "address": "UPHILLS BRIGHTWAY RUKUBA ROAD",
    "meterRecommended": "Three Phase",
    "discoCode": "JED001",
    "requestRef": "REF123456",
    "region": "DILIMI",
    "rrr": "120799142825",
    "amount": "10000",
    "orderId": "1633177984000",
    "status": "COMPLETED",
    "applicantName": "ABUTU AUGUSTINE",
    "phone1": "008036233685",
    "phone2": null,
    "area": "DILIMI",
    "feeder": "RUKUBA ROAD",
    "dtName": null,
    "dtCode": "JO-01-53-5B-75-07",
    "meterType": "Three Phase",
    "sealNo": "9900",
    "meterNo": "TP000000000001",
    "dateRequested": "2024-10-10T12:00:00.000Z",
    "datePaid": "2024-10-10T14:30:00.000Z",
    "dateCompleted": "2024-10-10T15:45:00.000Z"
  }
}
```

### 5. Get All Requests

**Endpoint:** `GET /api/v1/external/jed/requests`

**Description:** Get all customer requests with pagination and optional status filter.

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10, max: 100) - Records per page
- `status` (optional) - Filter by status: INITIATED, PAID, COMPLETED

**Example:** `GET /api/v1/external/jed/requests?page=1&limit=20&status=PAID`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "accountNumber": "477014",
      "custNames": "ABUTU AUGUSTINE",
      "status": "PAID",
      // ... other fields
    },
    {
      "id": 2,
      "accountNumber": "630957",
      "custNames": "JOHN DOE",
      "status": "PAID",
      // ... other fields
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 45,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 6. Get Requests By Status

**Endpoint:** `GET /api/v1/external/jed/requests/status/{status}`

**Description:** Get customer requests filtered by specific status.

**Path Parameters:**
- `status` (required) - One of: INITIATED, PAID, COMPLETED

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 10, max: 100)

**Example:** `GET /api/v1/external/jed/requests/status/COMPLETED?page=1&limit=10`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "accountNumber": "477014",
      "status": "COMPLETED",
      "sealNo": "9900",
      "meterNo": "TP000000000001",
      "dateCompleted": "2024-10-10T15:45:00.000Z",
      // ... other fields
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalCount": 15,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Database Schema

### jed_customer_request Table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| account_number | VARCHAR(50) | Customer account number (unique) |
| cust_names | VARCHAR(255) | Customer full name |
| gsm | VARCHAR(20) | Customer phone number |
| email | VARCHAR(255) | Customer email |
| address | TEXT | Customer address |
| meter_recommended | VARCHAR(50) | Meter type (Single/Three Phase) |
| disco_code | VARCHAR(50) | Distribution company code |
| request_ref | VARCHAR(100) | Optional request reference |
| region | VARCHAR(100) | Customer region |
| rrr | VARCHAR(50) | Remita payment reference |
| amount | DECIMAL(15,2) | Payment amount |
| order_id | VARCHAR(100) | Remita order ID |
| app_id | VARCHAR(100) | Application ID |
| date_requested | TIMESTAMP | Request creation date |
| status | VARCHAR(20) | INITIATED, PAID, COMPLETED |
| applicant_name | VARCHAR(255) | From JED response |
| phone1 | VARCHAR(20) | From JED response |
| phone2 | VARCHAR(20) | From JED response |
| area | VARCHAR(100) | From JED response |
| feeder | VARCHAR(100) | From JED response |
| dt_name | VARCHAR(100) | Distribution transformer name |
| dt_code | VARCHAR(100) | Distribution transformer code |
| meter_type | VARCHAR(50) | From JED response |
| pending_since | TIMESTAMP | From JED response |
| seal_no | VARCHAR(100) | Meter seal number |
| meter_no | VARCHAR(100) | Meter number |
| date_paid | TIMESTAMP | Payment confirmation date |
| date_completed | TIMESTAMP | Installation completion date |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

### meters Table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| meter_no | VARCHAR(100) | Meter number (unique) |
| meter_type | VARCHAR(50) | Single Phase / Three Phase |
| manufacturer | VARCHAR(100) | Meter manufacturer |
| model | VARCHAR(100) | Meter model |
| status | VARCHAR(20) | AVAILABLE, INSTALLED, FAULTY, RETIRED |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

## Status Flow

```
INITIATED → PAID → COMPLETED
```

1. **INITIATED**: Payment reference generated, awaiting payment
2. **PAID**: Payment confirmed with JED, awaiting installation
3. **COMPLETED**: Meter installed and confirmed with JED

## Testing the Integration

### Step 1: Generate Payment Reference

```bash
curl -X POST http://localhost:3000/api/v1/external/jed/generate-ref \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "TEST001",
    "custNames": "Test Customer",
    "gsm": "+2348012345678",
    "email": "test@example.com",
    "address": "Test Address, Lagos",
    "meterRecommended": "Three Phase",
    "discoCode": "JED001",
    "region": "Lagos"
  }'
```

### Step 2: Confirm Payment (After Customer Pays)

```bash
curl -X POST http://localhost:3000/api/v1/external/jed/confirm-payment \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "TEST001"
  }'
```

### Step 3: Complete Installation

```bash
curl -X POST http://localhost:3000/api/v1/external/jed/complete-installation \
  -H "Content-Type: application/json" \
  -d '{
    "sealNo": "SEAL001",
    "meterNo": "TP000000000001",
    "accountNumber": "TEST001"
  }'
```

### Step 4: Check Request Status

```bash
curl http://localhost:3000/api/v1/external/jed/requests/TEST001
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Additional error details (optional)"
}
```

## Swagger Documentation

Access complete interactive API documentation at:
```
http://localhost:3000/api-docs
```

Navigate to the **JED Integration** section to:
- View all endpoint details
- Test endpoints directly
- See request/response examples
- Review validation rules

## Production Considerations

### 1. Remita Configuration

For production, update `.env`:
```env
REMITA_BASE_URL=https://remita.net/remita/exapp/api/v1/send/api/echannelsvc
REMITA_MERCHANT_ID=your_production_merchant_id
REMITA_API_KEY=your_production_api_key
REMITA_SERVICE_TYPE_ID=your_production_service_type_id
```

### 2. JED Configuration

For production:
```env
JED_BASE_URL=https://production-jed-url.com/map/api
JED_API_KEY=your_production_jed_api_key
```

### 3. Webhook Setup (Optional)

Consider implementing Remita payment webhook for automatic payment confirmation instead of manual `confirm-payment` calls.

### 4. Meter Management

- Implement meter inventory management endpoints
- Track meter lifecycle (available → installed → retired)
- Implement bulk meter uploads
- Add meter maintenance records

### 5. Monitoring

- Log all external API calls (Remita & JED)
- Monitor success/failure rates
- Set up alerts for failed integrations
- Track processing times

## Support

For issues or questions about the JED integration module, check:
1. Swagger documentation at `/api-docs`
2. Database logs and error messages
3. External API responses from Remita and JED

## Quick Setup Commands

```bash
# 1. Run JED migration
npm run migrate:jed

# 2. Seed sample meters
npm run seed:meters

# 3. Start server
npm run dev

# 4. Access API docs
# http://localhost:3000/api-docs
```

Happy integrating! 🚀