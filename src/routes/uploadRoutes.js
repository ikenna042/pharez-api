const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const router = express.Router();

/**
 * @swagger
 * tags:
 *  name: Uploads
 *  description: Endpoints for uploading and processing Excel files
 * 
 */

// Configure multer for file upload (stores in memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
    }
  }
});

// /**
//  * @swagger
//  * /
//  * 
//  */

// router.get('/', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Upload endpoint is working'
//   });
// });

/**
 * @swagger
 * /uploads/excel:
 *   post:
 *     summary: Upload and process an Excel file
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File processed successfully
 *                 filename:
 *                   type: string
 *                   example: example.xlsx
 *                 sheets:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Sheet1", "Sheet2"]
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: object
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: File processing failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */

/**
 * @swagger
 * /uploads/excel-first-sheet:
 *   post:
 *     summary: Upload and process only the first sheet of an Excel file
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File processed successfully (first sheet only)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File processed successfully
 *                 filename:
 *                   type: string
 *                   example: example.xlsx
 *                 sheet:
 *                   type: string
 *                   example: Sheet1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: File processing failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */

// Endpoint to upload and process Excel file
/**
 * @swagger
 * /uploads/excel-modified:
 *   post:
 *     summary: Upload an Excel file, modify its content by adding new columns, and return the modified file
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File processed successfully (modified)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File processed successfully
 *                 filename:
 *                   type: string
 *                   example: example.xlsx
 *                 sheets:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Sheet1", "Sheet2"]
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: object
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: File processing failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */

// Endpoint to upload and process Excel file
/**
 * @swagger
 * /uploads/excel-modified:
 *   post:
 *     summary: Upload an Excel file, modify its content by adding new columns, and return the modified file
 *     tags: [Uploads]
 *     requestBody:
 */

router.post('/excel', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        // Read the uploaded Excel file from memory
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

        const allSheetsData = {};
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
            allSheetsData[sheetName] = jsonData;
        });

            // Log the JSON data
        console.log('=== Excel File Data ===');
        console.log(JSON.stringify(allSheetsData, null, 2));
        console.log('======================');

            // Send response
    res.json({
      message: 'File processed successfully',
      filename: req.file.originalname,
      sheets: workbook.SheetNames,
      data: allSheetsData
    });

    } catch (error) {
      console.error('File upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'File processing failed'
      });
    }
});

// alternative endpoint for just the first sheet
router.post('/excel-first-sheet', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        // Read the uploaded Excel file from memory
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

        const firstSheetName = workbook.SheetNames[0];
        const firstWorksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(firstWorksheet, { defval: null });

            // Log the JSON data
        console.log('=== First Sheet Data ===');
        console.log(JSON.stringify(jsonData, null, 2));
        console.log('======================');

            // Send response
    res.json({
      message: 'File processed successfully',
      filename: req.file.originalname,
      sheet: firstSheetName,
      data: jsonData
    });

    } catch (error) {
      console.error('File upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'File processing failed'
      });
    }
});

router.post('/excel-modified', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Read the uploaded Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    const allSheetsData = {};
    const modifiedSheetsData = {};

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      // Add new columns (example: "ProcessedAt" and "Status")
      const modifiedData = jsonData.map((row, index) => ({
        ...row,
        ProcessedAt: new Date().toISOString(),
        Status: index % 2 === 0 ? "OK" : "Pending" // Example values
      }));

      allSheetsData[sheetName] = jsonData;
      modifiedSheetsData[sheetName] = modifiedData;
    });

    // Create a new workbook with the modified data
    const newWorkbook = XLSX.utils.book_new();
    Object.keys(modifiedSheetsData).forEach(sheetName => {
      const newWorksheet = XLSX.utils.json_to_sheet(modifiedSheetsData[sheetName]);
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
    });

    // Convert workbook to buffer
    const newExcelBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers to return file
    res.setHeader('Content-Disposition', 'attachment; filename=modified.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Option 1: Send both JSON + Excel in one response (as base64)
    // res.json({
    //   message: 'File processed successfully',
    //   filename: req.file.originalname,
    //   sheets: workbook.SheetNames,
    //   data: allSheetsData,
    //   modifiedFile: newExcelBuffer.toString('base64') // send as base64 string
    // });

    // Option 2: Directly send the Excel file
    res.send(newExcelBuffer);

  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'File processing failed'
    });
  }
});

module.exports = router;