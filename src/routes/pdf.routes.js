// src/routes/pdf.routes.js
// ------------------------------------------------------
// Routing untuk fitur PDF (html->pdf, merge, stamp).
// ------------------------------------------------------

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { useCredit } = require('../middleware/creditMiddleware');
const pdfController = require('../controllers/pdf.controller');


// HTML -> PDF
router.post(
  '/html-to-pdf',
  authMiddleware,
  useCredit('HTML_TO_PDF'),
  pdfController.htmlToPdf
);

// Merge beberapa PDF dari URL
router.post(
  '/merge',
  authMiddleware,
  useCredit('MERGE'),
  pdfController.mergePdf
);

// Stamp PNG -> PDF
router.post(
  '/stamp',
  authMiddleware,
  useCredit('STAMP'),
  pdfController.stampPdf   // <== SAMA persis dengan export di pdf.controller.js
);

// Compress PDF dari URL
router.post(
  '/compress',
  authMiddleware,
  useCredit('PDF_COMPRESS'),
  pdfController.compressPdf
);

module.exports = router;
