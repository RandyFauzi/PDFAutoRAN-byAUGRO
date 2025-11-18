// src/services/pdf.service.js
// ----------------------------------------
// Service untuk operasi PDF (stamp PNG ke PDF)
// ----------------------------------------

const { PDFDocument } = require('pdf-lib');
const { downloadFile } = require('../utils/drive');

/**
 * Stamp PNG ke PDF dari URL.
 *
 * @param {object} params
 * @param {string} params.pdfUrl   - URL sumber PDF
 * @param {string} params.pngUrl   - URL sumber PNG (logo/TTD)
 * @param {number} params.page     - Nomor halaman (1-based). Default: 1
 * @param {number} params.x        - Posisi X dari sisi kiri (dalam satuan poin)
 * @param {number} params.y        - Posisi Y dari sisi atas (dalam satuan poin)
 * @param {number} [params.width]  - Lebar gambar (opsional; default: lebar asli PNG)
 * @param {number} [params.height] - Tinggi gambar (opsional; default: tinggi asli PNG)
 *
 * Catatan penting koordinat:
 * - pdf-lib pakai titik (0,0) di BAWAH-KIRI.
 * - Supaya lebih natural, API ini menganggap (x,y) dihitung dari ATAS-KIRI.
 *   Jadi nanti kita konversi ke koordinat pdf-lib di dalam fungsi ini.
 */
async function stampPngFromUrls({
  pdfUrl,
  pngUrl,
  page = 1,
  x,
  y,
  width,
  height,
}) {
  if (!pdfUrl || !pngUrl) {
    throw new Error('pdfUrl dan pngUrl wajib diisi di service stampPngFromUrls');
  }

  // Download PDF & PNG secara paralel
  const [pdfBuffer, pngBuffer] = await Promise.all([
    downloadFile(pdfUrl),
    downloadFile(pngUrl),
  ]);

  // Load PDF (abaikan encryption flag supaya lebih toleran ke file publik)
  const pdfDoc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
  });

  const pages = pdfDoc.getPages();
  if (!pages || pages.length === 0) {
    throw new Error('PDF tidak memiliki halaman.');
  }

  // Konversi page 1-based → 0-based, dan clamp ke range valid
  let pageIndex = Number.isNaN(Number(page)) ? 0 : Number(page) - 1;
  if (pageIndex < 0) pageIndex = 0;
  if (pageIndex >= pages.length) pageIndex = pages.length - 1;

  const targetPage = pages[pageIndex];
  const pageHeight = targetPage.getHeight();

  // Embed gambar PNG
  const pngImage = await pdfDoc.embedPng(pngBuffer);

  const imgWidth = typeof width === 'number' && width > 0 ? width : pngImage.width;
  const imgHeight =
    typeof height === 'number' && height > 0 ? height : pngImage.height;

  // API kita: x,y dari ATAS-KIRI.
  const posX = typeof x === 'number' ? x : 0;
  const posYFromTop = typeof y === 'number' ? y : 0;

  // Konversi ke koordinat pdf-lib (bottom-left)
  const drawX = posX;
  const drawY = pageHeight - posYFromTop - imgHeight;

  targetPage.drawImage(pngImage, {
    x: drawX,
    y: drawY,
    width: imgWidth,
    height: imgHeight,
  });

  const stampedBytes = await pdfDoc.save();
  return Buffer.from(stampedBytes);
}

module.exports = {
  stampPngFromUrls,
};
