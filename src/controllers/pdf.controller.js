// src/controllers/pdf.controller.js
const { PDFDocument } = require('pdf-lib');
const puppeteer = require('puppeteer');
const axios = require('axios');

const env = require('../config/env');
const userService = require('../services/user.service');
const pdfService = require('../services/pdf.service');
const { compressPdfBuffer } = require('../services/pdfCompress.service');


// =========================
// HELPER: HTML -> PDF BUFFER
// =========================

async function htmlToPdfBuffer(html) {
  // Versi sederhana: pakai puppeteer standar (di VPS nanti bisa diganti ke puppeteer-core + chromium)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}

// =========================
// HELPER: GOOGLE DRIVE URL
// =========================

// Ambil fileId dari URL Drive berbentuk:
// https://drive.google.com/file/d/FILE_ID/view?usp=...


function normalizeDriveUrl(url) {
  if (typeof url !== 'string') return url;

  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/);
  if (!match) return url;

  const fileId = match[1] || match[2];
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}


// Download URL (bisa Google Drive, bisa URL lain) -> Buffer

async function downloadAsBuffer(rawUrl, index) {
  const isDrive = rawUrl.includes('drive.google.com');
  const normalizedUrl = isDrive ? normalizeDriveUrl(rawUrl) : rawUrl;

  const candidateUrls = isDrive
    ? [
        normalizedUrl,
        rawUrl, // fallback: pakai URL view apa adanya
      ]
    : [rawUrl];

  let lastError = null;

  for (const url of candidateUrls) {
    try {
      console.log(`[PDF_MERGE][DOWNLOAD][${index}] ${url}`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: '*/*',
        },
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        lastError = new Error(
          `status ${response.status} saat mengakses ${url}`,
        );
        continue;
      }
      const contentType = response.headers['content-type'] || '';

      if (contentType.includes('text/html')) {
        lastError = new Error(
          `URL ${url} mengembalikan HTML (bukan file). Pastikan file public dan berupa PDF`
        );
        continue;
      }

      return Buffer.from(response.data);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  if (lastError) {
    throw new Error(
      `Gagal download PDF dari URL index ${index}: ${lastError.message}`,
    );
  }

  throw new Error(
    `Gagal download PDF dari URL index ${index}: alasan tidak diketahui`,
  );
}

// =========================
// CONTROLLER: HTML -> PDF
// =========================

async function htmlToPdf(req, res) {
  try {
    const userId = req.user.id; // tetap ada, kalau mau dipakai logging di masa depan

    const { html, fileName } = req.body;
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({
        message: 'Field "html" wajib diisi dan harus berupa string.',
      });
    }

    // Generate PDF (Buffer / Uint8Array)
    const pdfBufferRaw = await htmlToPdfBuffer(html);

    // Pastikan jadi Buffer Node asli
    const pdfBuffer = Buffer.isBuffer(pdfBufferRaw)
      ? pdfBufferRaw
      : Buffer.from(pdfBufferRaw);

    const safeName =
      (fileName && String(fileName).trim()) || 'html-to-pdf-output';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    // ⚠️ Penting: kita TIDAK pakai res.json / res.send(object)
    // Kita pakai low-level API supaya tidak di-JSON-kan lagi
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Kirim binary langsung
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('Error htmlToPdf:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat mengubah HTML menjadi PDF.',
      detail: err.message,
    });
  }
}


// =========================
// CONTROLLER: MERGE PDF DARI URL
// =========================

async function mergePdf(req, res) {
  try {
    const userId = req.user.id;
    const { urls, fileName } = req.body;

    // Validasi body
    if (!Array.isArray(urls) || urls.length < 2) {
      return res.status(400).json({
        message: 'Field "urls" harus array dan minimal berisi 2 link PDF.',
      });
    }

    // Download semua URL menjadi Buffer
    const pdfBuffers = [];
    for (let i = 0; i < urls.length; i += 1) {
      const rawUrl = urls[i];

      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return res.status(400).json({
          message: `URL pada index ${i} tidak valid (harus string, tidak boleh kosong).`,
        });
      }

      const buf = await downloadAsBuffer(rawUrl.trim(), i);
      pdfBuffers.push(buf);
    }

    // Buat PDF baru & merge
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfBuffers.length; i++) {
      const pdfBuffer = pdfBuffers[i];

      const safePdfBuffer = ensurePdfBuffer(pdfBuffer, i, req.body.options || {});

      const srcPdf = await PDFDocument.load(safePdfBuffer, {
        ignoreEncryption: true,
      });

      const copiedPages = await mergedPdf.copyPages(
        srcPdf,
        srcPdf.getPageIndices(),
      );
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }


    const mergedBytes = await mergedPdf.save();

    // Pastikan bentuknya Buffer Node
    const pdfBuffer = Buffer.isBuffer(mergedBytes)
      ? mergedBytes
      : Buffer.from(mergedBytes);

    const safeName =
      (fileName && String(fileName).trim()) || 'merged-document';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (err) {
      console.error('Error mergePdf:', err);

      const statusCode =
        err.message.includes('bukan PDF') ||
        err.message.includes('HTML')
          ? 400
          : 500;

      return res.status(statusCode).json({
        message:
          statusCode === 400
            ? 'Salah satu file tidak valid untuk merge'
            : 'Terjadi kesalahan saat merge PDF.',
        detail: err.message,
      });
    }

}

function isPdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;

  // Cek 5 byte pertama: %PDF-
  const header = buffer.slice(0, 5).toString('utf8');
  return header === '%PDF-';
}

function ensurePdfBuffer(buffer, index, options = {}) {
  if (isPdfBuffer(buffer)) return buffer;

  if (options.autoConvert === true) {
    // ⏳ FUTURE:
    // di sini nanti panggil service convert non-PDF → PDF
    // return convertedPdfBuffer;
  }

  throw new Error(
    `File pada index ${index} bukan PDF valid. Aktifkan auto-convert atau pastikan file sudah PDF.`
  );
}



// =========================
// CONTROLLER: STAMP PNG KE PDF
// =========================

async function stampPdf(req, res) {
  try {
    const userId = req.user.id;

    const {
      pdfUrl,
      imageUrl,
      page = 1,
      x,
      y,
      width,
      height,
      fileName,
    } = req.body;

    // Validasi input minimal
    if (!pdfUrl || !imageUrl) {
      return res.status(400).json({
        message: 'Field "pdfUrl" dan "imageUrl" wajib diisi.',
      });
    }

    // Download PDF & PNG sebagai Buffer
    const pdfBuffer = await downloadAsBuffer(String(pdfUrl).trim(), 'pdf');
    const imageBuffer = await downloadAsBuffer(
      String(imageUrl).trim(),
      'image',
    );

    const pageIndex = Number(page) > 0 ? Number(page) - 1 : 0;

    // Konversi koordinat & ukuran ke number (kalau ada)
    const posX = x != null ? Number(x) : 0;
    const posY = y != null ? Number(y) : 0;
    const w = width != null ? Number(width) : undefined;
    const h = height != null ? Number(height) : undefined;

    // Proses stamp lewat service
    const stampedBufferRaw = await pdfService.stampImageOnPdf(
      pdfBuffer,
      imageBuffer,
      {
        pageIndex,
        x: posX,
        y: posY,
        width: w,
        height: h,
      },
    );

    // Pastikan bentuknya Buffer Node
    const stampedBuffer = Buffer.isBuffer(stampedBufferRaw)
      ? stampedBufferRaw
      : Buffer.from(stampedBufferRaw);

    const safeName =
      (fileName && String(fileName).trim()) || 'stamped-document';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`,
    );
    res.setHeader('Content-Length', stampedBuffer.length);

    return res.end(stampedBuffer);
  } catch (err) {
    console.error('Error stampPdf:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat stamp PNG ke PDF.',
      detail: err.message,
    });
  }
}

// =========================
// CONTROLLER: COMPRESS PDF
// =========================

async function compressPdf(req, res) {
  try {
    const userId = req.user.id;
    const { pdfUrl, quality = 'medium', fileName } = req.body;

    if (!pdfUrl) {
      return res.status(400).json({ message: 'Field "pdfUrl" wajib diisi.' });
    }

    // 1. Download PDF asli
    const originalBuffer = await downloadAsBuffer(String(pdfUrl).trim(), 'pdf-compress');

    // Hitung jumlah halaman asli (DEBUG)
    const origDoc = await PDFDocument.load(originalBuffer);
    const originalPages = origDoc.getPageCount();
    console.log(`[COMPRESS] Original pages: ${originalPages}`);

    // 2. Compress pakai Ghostscript
    const compressedBufferRaw = await compressPdfBuffer(originalBuffer, quality);

    // 3. Pastikan hasil TIDAK menambah halaman
    const safeBuffer = await adjustCompressedPages(
      originalBuffer,
      compressedBufferRaw
    );

    // Debug tampilan final
    const finalDoc = await PDFDocument.load(safeBuffer);
    console.log(`[COMPRESS] Final pages: ${finalDoc.getPageCount()}`);

    // 4. Kirim PDF hasil akhir
    const safeName =
      (fileName && String(fileName).trim()) || 'compressed-document';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`
    );
    res.setHeader('Content-Length', safeBuffer.length);

    return res.end(safeBuffer);
  } catch (err) {
    console.error('Error compressPdf:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat compress PDF.',
      detail: err.message,
    });
  }
}



async function adjustCompressedPages(originalBuffer, compressedBuffer) {
  const origDoc = await PDFDocument.load(originalBuffer);
  const compDoc = await PDFDocument.load(compressedBuffer);

  const origCount = origDoc.getPageCount();
  const compCount = compDoc.getPageCount();

  // Kalau jumlahnya sama → aman
  if (origCount === compCount) return compressedBuffer;

  // Kalau Ghostscript menghasilkan halaman lebih banyak → trim
  const out = await PDFDocument.create();
  const copyIndices = Array.from(
    { length: Math.min(origCount, compCount) },
    (_, i) => i
  );

  const copiedPages = await out.copyPages(compDoc, copyIndices);
  copiedPages.forEach((p) => out.addPage(p));

  const finalBytes = await out.save();
  return Buffer.from(finalBytes);
}

module.exports = {
  htmlToPdf,
  mergePdf,
  stampPdf,
  compressPdf,
};

