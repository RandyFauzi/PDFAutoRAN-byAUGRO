// src/services/pdf.service.js
const { PDFDocument } = require('pdf-lib');

/**
 * Stamp gambar (PNG/JPEG) ke sebuah PDF.
 *
 * @param {Buffer} pdfBuffer      - Buffer PDF asli.
 * @param {Buffer} imageBuffer    - Buffer gambar (PNG/JPEG) – satu gambar yang sama untuk semua stamp.
 * @param {Object|Object[]} options
 * @param {number} [options.pageIndex=0] - Index halaman (0-based).
 * @param {number} [options.x=0]         - Posisi X.
 * @param {number} [options.y=0]         - Posisi Y.
 * @param {number} [options.width]       - Lebar gambar.
 * @param {number} [options.height]      - Tinggi gambar.
 *
 * @returns {Promise<Buffer>} Buffer PDF baru yang sudah ada stamp.
 */
async function stampImageOnPdf(pdfBuffer, imageBuffer, options = {}) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  // Embed image (PNG → fallback JPG)
  let img;
  try {
    img = await pdfDoc.embedPng(imageBuffer);
  } catch {
    img = await pdfDoc.embedJpg(imageBuffer);
  }

  const pages = pdfDoc.getPages();

  // Normalisasi: jika bukan array → jadikan array
  const tasks = Array.isArray(options) ? options : [options];

  for (const opt of tasks) {
    if (!opt) continue;

    // JANGAN pakai "opt.pageIndex || 0" karena 0 itu falsy → selalu balik ke 0
    let idx = Number(opt.pageIndex);
    if (!Number.isFinite(idx) || idx < 0) {
      idx = 0;
    }

    // Kalau index di luar range halaman, skip aja
    if (idx >= pages.length) {
      console.warn(`[STAMP] Skip pageIndex ${idx}, total pages: ${pages.length}`);
      continue;
    }

    const page = pages[idx];

    const width =
      opt.width != null ? Number(opt.width) : img.width;
    const height =
      opt.height != null ? Number(opt.height) : img.height;

    const x = opt.x != null ? Number(opt.x) : 0;
    const y = opt.y != null ? Number(opt.y) : 0;

    page.drawImage(img, {
      x,
      y,
      width,
      height,
    });
  }

  const finalPdf = await pdfDoc.save();
  return Buffer.from(finalPdf);
}

module.exports = { stampImageOnPdf };
