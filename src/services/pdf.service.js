const { PDFDocument } = require('pdf-lib');

/**
 * Stamp gambar (PNG/JPEG) ke sebuah PDF.
 *
 * @param {Buffer} pdfBuffer      - Buffer PDF asli.
 * @param {Buffer} imageBuffer    - Buffer gambar (PNG/JPEG).
 * @param {Object} options
 * @param {number} [options.pageIndex=0] - Index halaman (0-based).
 * @param {number} [options.x=0]         - Posisi X (dalam point PDF).
 * @param {number} [options.y=0]         - Posisi Y (dalam point PDF).
 * @param {number} [options.width]       - Lebar gambar (optional).
 * @param {number} [options.height]      - Tinggi gambar (optional).
 *
 * @returns {Promise<Buffer>} Buffer PDF baru yang sudah ada stamp.
 */
async function stampImageOnPdf(pdfBuffer, imageBuffer, options = {}) {
  const {
    pageIndex = 0,
    x = 0,
    y = 0,
    width,
    height,
  } = options;

  // Load PDF (abaikan encryption flag supaya PDF publik "protected" bisa tetap dibaca)
  const pdfDoc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
  });

  // Embed gambar (coba PNG dulu, kalau gagal baru JPEG)
  let embeddedImage;
  try {
    embeddedImage = await pdfDoc.embedPng(imageBuffer);
  } catch (err) {
    embeddedImage = await pdfDoc.embedJpg(imageBuffer);
  }

  const pages = pdfDoc.getPages();
  const page = pages[pageIndex] || pages[0]; // fallback ke halaman pertama

  const finalWidth = width || embeddedImage.width;
  const finalHeight = height || embeddedImage.height;

  // Koordinat di PDF: (0,0) di kiri-bawah
  page.drawImage(embeddedImage, {
    x,
    y,
    width: finalWidth,
    height: finalHeight,
  });

  const stampedBytes = await pdfDoc.save();
  return Buffer.from(stampedBytes);
}

module.exports = {
  stampImageOnPdf,
};
