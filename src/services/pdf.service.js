// src/services/pdf.service.js
const { PDFDocument } = require('pdf-lib');

/**
 * Stamp satu gambar (PNG/JPEG) ke satu atau banyak halaman PDF.
 *
 * @param {Buffer} pdfBuffer       - Buffer PDF asli.
 * @param {Buffer} imageBuffer     - Buffer gambar (PNG/JPEG) – dipakai untuk semua stamp.
 * @param {Object|Object[]} config - Satu objek atau array konfigurasi.
 *    {
 *      pageIndex: number (0-based),
 *      x: number,
 *      y: number,
 *      width?: number,
 *      height?: number
 *    }
 *
 * @returns {Promise<Buffer>} Buffer PDF baru yang sudah ter-stamp.
 */
async function stampImageOnPdf(pdfBuffer, imageBuffer, config = {}) {
  // Muat dokumen PDF (abaikan encryption flag)
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  // Embed gambar (coba PNG dulu, kalau gagal baru JPEG)
  let embeddedImage;
  try {
    embeddedImage = await pdfDoc.embedPng(imageBuffer);
  } catch {
    embeddedImage = await pdfDoc.embedJpg(imageBuffer);
  }

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  // Normalisasi: kalau bukan array, jadikan array
  const tasks = Array.isArray(config) ? config : [config];

  for (const opt of tasks) {
    if (!opt) continue;

    // pageIndex wajib number, default 0
    let pageIndex = 0;
    if (typeof opt.pageIndex === 'number' && Number.isInteger(opt.pageIndex)) {
      pageIndex = opt.pageIndex;
    }

    // Jika di luar range, SKIP (jangan dipaksa ke halaman pertama)
    if (pageIndex < 0 || pageIndex >= totalPages) {
      console.warn(
        `[STAMP] pageIndex ${pageIndex} di luar range (0..${totalPages - 1}), dilewati`
      );
      continue;
    }

    const page = pages[pageIndex];

    const width =
      opt.width != null ? Number(opt.width) : embeddedImage.width;
    const height =
      opt.height != null ? Number(opt.height) : embeddedImage.height;

    const x = opt.x != null ? Number(opt.x) : 0;
    const y = opt.y != null ? Number(opt.y) : 0;

    page.drawImage(embeddedImage, {
      x,
      y,
      width,
      height,
    });
  }

  const outputBytes = await pdfDoc.save();
  return Buffer.from(outputBytes);
}

module.exports = {
  stampImageOnPdf,
};
