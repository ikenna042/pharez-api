const XLSX = require('xlsx');

class ExcelService {
  
  // Parse meter upload Excel file
  static parseMeterExcel(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (data.length === 0) {
        throw new Error('Excel file is empty');
      }

      // Map Excel columns to database fields using normalized header keys (robust to variants)
      const meters = data.map((row, index) => {
        // Build normalized row: keys uppercased and stripped of non-alphanumeric
        const normalized = {};
        for (const originalKey of Object.keys(row)) {
          if (!originalKey) continue;
          const normKey = originalKey.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
          normalized[normKey] = row[originalKey];
        }

        // Required: METER NUMBER
        const meterNumberRaw = normalized['METERNUMBER'] ?? normalized['METERNUMBER'];
        if (!meterNumberRaw) {
          throw new Error(`Row ${index + 2}: METER NUMBER is required`);
        }

        // Phase type normalization
        let phaseTypeRaw = normalized['PHASETYPE'] ?? normalized['PHASE_TYPE'];
        let phaseType = null;
        if (phaseTypeRaw) {
          phaseType = phaseTypeRaw.toString().toUpperCase().trim();
          if (!['SINGLEPHASE', 'THREEPHASE', 'SINGLE PHASE', 'THREE PHASE'].includes(phaseType.replace(/\s+/g, ''))) {
            // Allow both spaced and non-spaced variants
            throw new Error(`Row ${index + 2}: Invalid PHASE TYPE. Must be 'SINGLE PHASE' or 'THREE PHASE'`);
          }
          // Normalize to DB values
          if (phaseType.includes('SINGLE')) phaseType = 'SINGLE PHASE';
          if (phaseType.includes('THREE')) phaseType = 'THREE PHASE';
        }

        // SGC detection: prefer explicit keys, otherwise find any normalized key containing 'SGC'
        let sgcCell = normalized['SGCNUMBER'] ?? normalized['SGCNO'] ?? normalized['SGC'] ?? null;
        if (!sgcCell) {
          const sgcKey = Object.keys(normalized).find(k => k.includes('SGC'));
          if (sgcKey) sgcCell = normalized[sgcKey];
        }

        // Fallbacks for other fields using substring matching
        const simCell = normalized['SIMNUMBER'] ?? Object.keys(normalized).find(k => k.includes('SIM')) ? (normalized[Object.keys(normalized).find(k => k.includes('SIM'))]) : null;
        const manuCell = normalized['MANUFACTUREDDATE'] ?? Object.keys(normalized).find(k => k.includes('MANUFACTUR')) ? (normalized[Object.keys(normalized).find(k => k.includes('MANUFACTUR'))]) : null;
        const makeCell = normalized['METERMAKE'] ?? Object.keys(normalized).find(k => k.includes('METERMAKE') || k === 'MAKE') ? (normalized[Object.keys(normalized).find(k => k.includes('METERMAKE') || k === 'MAKE')]) : null;
        const modelCell = normalized['MODEL'] ?? Object.keys(normalized).find(k => k.includes('MODEL')) ? (normalized[Object.keys(normalized).find(k => k.includes('MODEL'))]) : null;

        return {
          meterNumber: meterNumberRaw?.toString().trim(),
          simNumber: simCell ? simCell.toString().trim() : null,
          manufacturedDate: manuCell ? manuCell.toString().trim() : null,
          meterMake: makeCell ? makeCell.toString().trim() : null,
          model: modelCell ? modelCell.toString().trim() : null,
          phaseType: phaseType || null,
          sgcNumber: sgcCell?.toString().trim() || null
        };
      });

      return meters;
    } catch (error) {
      if (error.message.includes('Row')) {
        throw error;
      }
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  // Generate meter Excel template
  static generateMeterTemplate() {
    const templateData = [
      {
        'METER NUMBER': '0239330009840',
        'SIM NUMBER': '0613570771',
        'MANUFACTURED DATE': '2024',
        'METER MAKE': 'ME METERING',
        'MODEL': 'MEM330',
        'PHASE TYPE': 'THREE PHASE',
        'SGC NUMBER': '999907'
      },
      {
        'METER NUMBER': '0239330000518',
        'SIM NUMBER': '0613570772',
        'MANUFACTURED DATE': '2024',
        'METER MAKE': 'ME METERING',
        'MODEL': 'MEM330',
        'PHASE TYPE': 'THREE PHASE',
        'SGC NUMBER': '999907'
      },
      {
        'METER NUMBER': '0239330009824',
        'SIM NUMBER': '0613570773',
        'MANUFACTURED DATE': '2024',
        'METER MAKE': 'ME METERING',
        'MODEL': 'MEM330',
        'PHASE TYPE': 'SINGLE PHASE',
        'SGC NUMBER': '999907'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // METER NUMBER
      { wch: 15 }, // SIM NUMBER
      { wch: 20 }, // MANUFACTURED DATE
      { wch: 20 }, // METER MAKE
      { wch: 15 }, // MODEL
      { wch: 15 }, // PHASE TYPE
      { wch: 15 }  // SGC NUMBER
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Meters');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Export meters to Excel
  static exportMetersToExcel(meters) {
    const exportData = meters.map(meter => ({
      'METER NUMBER': meter.meterNumber,
      'SIM NUMBER': meter.simNumber || '',
      'MANUFACTURED DATE': meter.manufacturedDate || '',
      'METER MAKE': meter.meterMake || '',
      'MODEL': meter.model || '',
      'PHASE TYPE': meter.phaseType || '',
      'SGC NUMBER': meter.sgcNumber || '',
      'STATUS': meter.status,
      'UPLOADED AT': meter.uploadedAt ? new Date(meter.uploadedAt).toLocaleString() : '',
      'INSTALLED AT': meter.installedAt ? new Date(meter.installedAt).toLocaleString() : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // METER NUMBER
      { wch: 15 }, // SIM NUMBER
      { wch: 20 }, // MANUFACTURED DATE
      { wch: 20 }, // METER MAKE
      { wch: 15 }, // MODEL
      { wch: 15 }, // PHASE TYPE
      { wch: 15 }, // SGC NUMBER
      { wch: 12 }, // STATUS
      { wch: 22 }, // UPLOADED AT
      { wch: 22 }  // INSTALLED AT
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Meters');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Export customer requests to Excel
  static exportCustomerRequestsToExcel(requests) {
    const exportData = requests.map(request => ({
      'ACCOUNT NUMBER': request.accountNumber,
      'CUSTOMER NAME': request.custNames,
      'PHONE (GSM)': request.gsm,
      'EMAIL': request.email,
      'ADDRESS': request.address,
      'METER RECOMMENDED': request.meterRecommended,
      'DISCO CODE': request.discoCode,
      'REQUEST REF': request.requestRef || '',
      'REGION': request.region || '',
      'RRR': request.rrr || '',
      'AMOUNT': request.amount || '',
      'ORDER ID': request.orderId || '',
      'STATUS': request.status,
      'DATE REQUESTED': request.dateRequested ? new Date(request.dateRequested).toLocaleString() : '',
      'APPLICANT NAME': request.applicantName || '',
      'PHONE 1': request.phone1 || '',
      'PHONE 2': request.phone2 || '',
      'AREA': request.area || '',
      'FEEDER': request.feeder || '',
      'DT NAME': request.dtName || '',
      'DT CODE': request.dtCode || '',
      'METER TYPE': request.meterType || '',
      'SEAL NO': request.sealNo || '',
      'METER NO': request.meterNo || '',
      'DATE PAID': request.datePaid ? new Date(request.datePaid).toLocaleString() : '',
      'DATE COMPLETED': request.dateCompleted ? new Date(request.dateCompleted).toLocaleString() : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const colWidths = [
      { wch: 18 }, // ACCOUNT NUMBER
      { wch: 25 }, // CUSTOMER NAME
      { wch: 18 }, // PHONE (GSM)
      { wch: 30 }, // EMAIL
      { wch: 40 }, // ADDRESS
      { wch: 20 }, // METER RECOMMENDED
      { wch: 12 }, // DISCO CODE
      { wch: 15 }, // REQUEST REF
      { wch: 15 }, // REGION
      { wch: 18 }, // RRR
      { wch: 12 }, // AMOUNT
      { wch: 18 }, // ORDER ID
      { wch: 12 }, // STATUS
      { wch: 22 }, // DATE REQUESTED
      { wch: 25 }, // APPLICANT NAME
      { wch: 18 }, // PHONE 1
      { wch: 18 }, // PHONE 2
      { wch: 15 }, // AREA
      { wch: 20 }, // FEEDER
      { wch: 20 }, // DT NAME
      { wch: 20 }, // DT CODE
      { wch: 15 }, // METER TYPE
      { wch: 15 }, // SEAL NO
      { wch: 20 }, // METER NO
      { wch: 22 }, // DATE PAID
      { wch: 22 }  // DATE COMPLETED
    ];
    
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Requests');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = ExcelService;