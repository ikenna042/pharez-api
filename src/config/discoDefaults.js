/**
 * Default per-disco import mappings and export templates.
 *
 * These are seeded into the `discos` table by `npm run migrate` and can be edited
 * afterwards through PUT /api/v1/discos/:code/import-mapping and
 * PUT /api/v1/discos/:code/export-template. The seed uses ON CONFLICT DO NOTHING,
 * so edits made through the API are never clobbered by a re-run.
 *
 * `transform` names resolve against the registry in src/utils/normalizers.js.
 * Header aliases are matched after normalization (uppercase, non-alphanumerics stripped).
 */

// Aba Power sends: CUSTOMER NAME | CUSTOMER ADDRESS | CUSTOMER PHONE NUMBER | FEEDER NAME |
// RECOMMENDED METER INSTALLATION POSITION | RECOMMENDED METER TYPE | ACCOUNT NUMBER |
// TRANSFORMER NAME | METER VENDOR
const ABA_POWER_IMPORT_MAPPING = {
  pendingInstallations: {
    sheetIndex: 0,
    headerRow: 1,
    keyField: 'accountNumber',
    captureExtras: true,
    fields: {
      accountNumber: {
        headers: ['ACCOUNTNUMBER', 'ACCTNO', 'ACCOUNTNO'],
        required: true,
        transform: 'text'
      },
      customerName: {
        headers: ['CUSTOMERNAME', 'CUSTNAMES', 'NAME'],
        required: true,
        transform: 'trim'
      },
      customerAddress: {
        headers: ['CUSTOMERADDRESS', 'ADDRESS'],
        transform: 'trim'
      },
      customerPhone: {
        headers: ['CUSTOMERPHONENUMBER', 'PHONENUMBER', 'GSM', 'PHONE'],
        transform: 'ngPhone'
      },
      feederName: {
        headers: ['FEEDERNAME', 'FEEDER'],
        transform: 'trim'
      },
      installationPosition: {
        headers: ['RECOMMENDEDMETERINSTALLATIONPOSITION', 'INSTALLATIONPOSITION', 'METERPOSITION'],
        transform: 'upper'
      },
      meterType: {
        headers: ['RECOMMENDEDMETERTYPE', 'METERTYPE', 'METERRECOMMENDED'],
        required: true,
        transform: 'phase'
      },
      transformerName: {
        headers: ['TRANSFORMERNAME', 'DTNAME', 'DT'],
        transform: 'trim'
      },
      meterVendor: {
        headers: ['METERVENDOR', 'VENDOR'],
        transform: 'trim'
      }
    }
  },

  // Meter + Simcards sheet: Meter No | Sim card serial number | Column1 (phase)
  meterInventory: {
    sheetIndex: 0,
    headerRow: 1,
    keyField: 'meterNumber',
    captureExtras: false,
    fields: {
      meterNumber: {
        headers: ['METERNO', 'METERNUMBER', 'METERSERIAL'],
        required: true,
        transform: 'text',
        // Master Energy serials are zero-padded to 13 chars; Excel may have eaten the leading 0
        padStart: 13
      },
      simNumber: {
        headers: ['SIMCARDSERIALNUMBER', 'SIMNUMBER', 'SIMSERIAL', 'SIM'],
        transform: 'text'
      },
      phaseType: {
        headers: ['COLUMN1', 'PHASE', 'PHASETYPE', 'METERTYPE'],
        transform: 'phase',
        keepRaw: true
      }
    }
  }
};

// The exact 11 columns Aba Power expects back, in order.
const ABA_POWER_EXPORT_TEMPLATE = {
  installationResponse: {
    sheetName: 'Installations',
    fileNamePrefix: 'aba_power_installations',
    columns: [
      { header: 'Timestamp', source: 'reportedAt', format: 'datetime', width: 22 },
      { header: 'Installation Date', source: 'installationDate', format: 'date', width: 16 },
      { header: 'Customer Name', source: 'customerName', width: 28 },
      { header: 'Customer Account number', source: 'accountNumber', format: 'text', width: 20 },
      { header: 'Meter Number', source: 'meterNumber', format: 'text', width: 18 },
      { header: 'APLE Seal Number', source: 'sealNumber', format: 'text', width: 18 },
      { header: 'Latitude', source: 'latitude', format: 'number', width: 12 },
      { header: 'Longitude', source: 'longitude', format: 'number', width: 12 },
      { header: 'Aba power Supervisor', source: 'discoSupervisor', width: 22 },
      { header: 'Installer Name', source: 'installerName', width: 22 },
      { header: 'Picture of installation (URL)', source: 'installationPhotoUrl', width: 40 }
    ]
  }
};

module.exports = {
  ABA_POWER_IMPORT_MAPPING,
  ABA_POWER_EXPORT_TEMPLATE
};
