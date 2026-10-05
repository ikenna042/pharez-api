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

  // Meter + Simcards sheet: Meter Number | Sim Number | Manufactured Date |
  // Meter Make | Model | Phase Type | Sgc Number
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
      manufacturedDate: {
        headers: ['MANUFACTURED DATE', 'MANUFACTURE DATE', 'YEAR OF MANUFACTURE', 'YEAR'],
        transform: 'trim'
      },
      meterMake: {
        headers: ['METER MAKE', 'MAKE', 'MANUFACTURER'],
        transform: 'trim'
      },
      model: {
        headers: ['MODEL', 'METER MODEL'],
        transform: 'trim'
      },
      phaseType: {
        headers: ['COLUMN1', 'PHASE', 'PHASETYPE', 'METERTYPE'],
        transform: 'phase',
        keepRaw: true
      },
      sgcNumber: {
        headers: ['SGC NUMBER', 'SGCNO', 'SGC'],
        transform: 'trim'
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

// PHEDC (Bayelsa) sends: REGION | FEEDER33NAME | FEEDER11NAME | DTRNAME | DTRID |
// ACCOUNT_NO | NAME | ADDRESS | STATUS
//
// Unlike Aba Power there's no meter type and no phone number. meterType is
// therefore optional: PHEDC jobs import without one, and recordInstallation
// takes the phase of the meter actually installed. The optional meterType and
// customerPhone aliases are only picked up if a later PHEDC sheet includes them.
// FEEDER11NAME is all dashes in the sample, so it's left unmapped (kept in
// source_row via captureExtras, along with STATUS).
const PHEDC_IMPORT_MAPPING = {
  pendingInstallations: {
    sheetIndex: 0,
    headerRow: 1,
    keyField: 'accountNumber',
    captureExtras: true,
    fields: {
      accountNumber: {
        // Some are sub-accounts with a letter suffix (877906308801B), so text, not a number.
        headers: ['ACCOUNT_NO', 'ACCOUNTNO'],
        required: true,
        transform: 'text'
      },
      customerName: {
        headers: ['NAME'],
        required: true,
        transform: 'trim'
      },
      customerAddress: {
        headers: ['ADDRESS', 'CUSTOMERADDRESS'],
        transform: 'trim'
      },
      feederName: {
        headers: ['FEEDER33NAME', 'FEEDERNAME'],
        transform: 'trim'
      },
      transformerName: {
        headers: ['DTRNAME', 'TRANSFORMERNAME'],
        transform: 'trim'
      },
      transformerCode: {
        headers: ['DTRID', 'TRANSFORMERCODE'],
        transform: 'text'
      },
      region: {
        headers: ['REGION'],
        transform: 'trim'
      },
      customerPhone: {
        headers: ['CUSTOMERPHONENUMBER', 'PHONENUMBER', 'PHONE', 'GSM'],
        transform: 'ngPhone'
      },
      meterType: {
        headers: ['METERTYPE', 'PHASE', 'PHASETYPE'],
        transform: 'phase'
      }
    }
  },

  // Same supplier spreadsheet as Aba Power.
  meterInventory: ABA_POWER_IMPORT_MAPPING.meterInventory
};

// Starts as Aba Power's layout until PHEDC supplies its own; replace it with
// PUT /api/v1/discos/PHEDC/export-template, no deploy needed.
const PHEDC_EXPORT_TEMPLATE = {
  installationResponse: {
    ...ABA_POWER_EXPORT_TEMPLATE.installationResponse,
    fileNamePrefix: 'phedc_installations',
    columns: ABA_POWER_EXPORT_TEMPLATE.installationResponse.columns.map((column) => {
      if (column.source === 'discoSupervisor') return { ...column, header: 'PHEDC Supervisor' };
      if (column.source === 'sealNumber') return { ...column, header: 'Seal Number' };
      return column;
    })
  }
};

module.exports = {
  ABA_POWER_IMPORT_MAPPING,
  ABA_POWER_EXPORT_TEMPLATE,
  PHEDC_IMPORT_MAPPING,
  PHEDC_EXPORT_TEMPLATE
};
