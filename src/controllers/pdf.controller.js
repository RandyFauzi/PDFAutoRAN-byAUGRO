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
  const match = url.match(/\/file\/d\/([^/]+)\//);
  if (!match) return url;
  const fileId = match[1];
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
      console.log(`[MERGE] Mencoba download (index ${index}) dari: ${url}`);

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

    for (const pdfBuffer of pdfBuffers) {
      const srcPdf = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true, // abaikan flag encryption "aneh" dari PDF publik
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
    return res.status(500).json({
      message: 'Terjadi kesalahan saat merge PDF.',
      detail: err.message,
    });
  }
}

// =========================
// HELPER: PARSE "pages"
// =========================

// Terima input: "1,2", "1-3,5", 2, [1,2,4], dst.
// Return: array unik [1,2,3,5] (1-based).
function parsePagesToArray(pages) {
  // Kalau sudah array -> normalisasi ke number
  if (Array.isArray(pages)) {
    return pages
      .map((p) => Number(p))
      .filter((n) => Number.isFinite(n) && n >= 1);
  }

  // Kalau number tunggal
  if (typeof pages === 'number') {
    return Number.isFinite(pages) && pages >= 1 ? [pages] : [];
  }

  // Kalau string "1,2" atau "1-3,5"
  if (typeof pages === 'string') {
    return pages
      .split(',')
      .flatMap((part) => {
        const trimmed = part.trim();
        if (!trimmed) return [];

        // Range: "2-4"
        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-').map((s) => s.trim());
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
          const from = Math.min(start, end);
          const to = Math.max(start, end);
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        }

        // Single number: "3"
        const n = parseInt(trimmed, 10);
        return Number.isFinite(n) && n >= 1 ? [n] : [];
      })
      // unik + urut + >=1
      .filter((v, i, arr) => v >= 1 && arr.indexOf(v) === i)
      .sort((a, b) => a - b);
  }

  // Format lain -> kosong
  return [];
}


function parsePositiveInt(value, defaultValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  if (n <= 0) return defaultValue;
  return Math.floor(n);
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
      page,    // mode lama: satu halaman
      pages,   // mode baru: jumlah halaman pertama
      x,
      y,
      width,
      height,
      fileName,
      stamps,  // mode advanced: array object, tiap halaman bisa beda
    } = req.body;

    // Validasi minimal
    if (!pdfUrl || !imageUrl) {
      return res.status(400).json({
        message: 'Field "pdfUrl" dan "imageUrl" wajib diisi.',
      });
    }

    // Download PDF & Gambar
    const pdfBuffer = await downloadAsBuffer(String(pdfUrl).trim(), 'pdf');
    const imageBuffer = await downloadAsBuffer(
      String(imageUrl).trim(),
      'image',
    );

    // Kita perlu tahu jumlah halaman utk mode "pages"
    const pdfDocTemp = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
    });
    const totalPages = pdfDocTemp.getPageCount();

    // Normalisasi ukuran & posisi default
    const baseX = x != null ? Number(x) : 0;
    const baseY = y != null ? Number(y) : 0;
    const baseWidth = width != null ? Number(width) : undefined;
    const baseHeight = height != null ? Number(height) : undefined;

    let options;

    // ============================================
    // 1) MODE ADVANCED: stamps = [{ page, x,y,width,height }, ...]
    // ============================================
    if (Array.isArray(stamps) && stamps.length > 0) {
      options = stamps.map((s) => {
        const p = parsePositiveInt(s.page || 1, 1); // 1-based
        return {
          pageIndex: p - 1, // 0-based
          x: s.x != null ? Number(s.x) : baseX,
          y: s.y != null ? Number(s.y) : baseY,
          width:
            s.width != null ? Number(s.width) : baseWidth,
          height:
            s.height != null ? Number(s.height) : baseHeight,
        };
      });
    }

    // ============================================
    // 2) MODE "pages" = jumlah halaman pertama
    //    contoh: pages = 2 → stamp di halaman 1 dan 2
    // ============================================
    else if (pages !== undefined) {
      const count = parsePositiveInt(pages, 1); // misal "2" → 2
      // Jangan lebih dari total halaman
      const maxPages = Math.min(count, totalPages);

      options = [];
      for (let i = 0; i < maxPages; i += 1) {
        options.push({
          pageIndex: i, // 0..maxPages-1
          x: baseX,
          y: baseY,
          width: baseWidth,
          height: baseHeight,
        });
      }
    }

    // ============================================
    // 3) MODE LAMA: 1 halaman saja (field "page")
    // ============================================
    else {
      const p = parsePositiveInt(page || 1, 1); // default 1
      options = {
        pageIndex: p - 1, // 0-based
        x: baseX,
        y: baseY,
        width: baseWidth,
        height: baseHeight,
      };
    }

    // Proses stamping di service
    const stampedRaw = await pdfService.stampImageOnPdf(
      pdfBuffer,
      imageBuffer,
      options,
    );

    const stamped = Buffer.isBuffer(stampedRaw)
      ? stampedRaw
      : Buffer.from(stampedRaw);

    const safeName =
      (fileName && String(fileName).trim()) || 'stamped-document';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`,
    );
    res.setHeader('Content-Length', stamped.length);

    return res.end(stamped);
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

