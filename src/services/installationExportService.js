const XLSX = require('xlsx');

/**
 * Renders installation rows into a disco's exact response-sheet layout, driven
 * entirely by that disco's stored export template.
 */
class InstallationExportService {
  /**
   * Formats a value for a spreadsheet cell.
   *
   * 'text' is important for account, meter and seal numbers: leaving them as
   * strings stops Excel reinterpreting "0239110006909" as a number and eating
   * the leading zero when the disco opens the file.
   */
  static pad(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Render a Date using its LOCAL calendar parts, never toISOString().
   *
   * node-postgres hands back a DATE column as local midnight. In WAT (+01:00)
   * toISOString() would turn 2026-09-05 into "2026-09-04T23:00:00Z" and the sheet
   * would report every installation a day early -- which is exactly the field the
   * disco reconciles against.
   */
  static localParts(d) {
    return {
      date: `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`,
      time: `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}:${this.pad(d.getSeconds())}`
    };
  }

  static formatValue(value, format) {
    if (value === null || value === undefined) return '';

    switch (format) {
      case 'datetime': {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const { date, time } = this.localParts(d);
        return `${date} ${time}`;
      }
      case 'date': {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return this.localParts(d).date;
      }
      case 'number': {
        const n = Number(value);
        return Number.isFinite(n) ? n : '';
      }
      case 'text':
        return String(value);
      default:
        return value;
    }
  }

  /**
   * Passing an explicit `header` array to json_to_sheet is what guarantees the
   * disco's exact column order, and keeps columns that happen to be empty in
   * every row. Without it SheetJS infers both from the first object's keys.
   */
  static buildWorkbook(rows, template) {
    const columns = template.columns;
    const headers = columns.map((c) => c.header);

    const data = rows.map((row) =>
      Object.fromEntries(columns.map((c) => [c.header, this.formatValue(row[c.source], c.format)]))
    );

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    worksheet['!cols'] = columns.map((c) => ({ wch: c.width || 18 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName || 'Sheet1');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  static buildFileName(template, discoCode) {
    const prefix = template.fileNamePrefix || `${String(discoCode).toLowerCase()}_export`;
    return `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
}

module.exports = InstallationExportService;
