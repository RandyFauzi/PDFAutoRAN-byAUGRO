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

  // ⚡ Normalisasi: jika bukan array → jadikan array
  const tasks = Array.isArray(options) ? options : [options];

  for (const opt of tasks) {
    if (!opt) continue;

    const page = pages[opt.pageIndex || 0] || pages[0];

    const width = opt.width || img.width;
    const height = opt.height || img.height;

    page.drawImage(img, {
      x: opt.x || 0,
      y: opt.y || 0,
      width,
      height,
    });
  }

  const finalPdf = await pdfDoc.save();
  return Buffer.from(finalPdf);
}

module.exports = { stampImageOnPdf };
