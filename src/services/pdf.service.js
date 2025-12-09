// src/services/pdf.service.js
const { PDFDocument } = require('pdf-lib');

/**
 * Stamp gambar (PNG/JPEG) ke sebuah PDF.
 *
 * @param {Buffer} pdfBuffer      - Buffer PDF asli.
 * @param {Buffer} imageBuffer    - Buffer gambar (PNG/JPEG) – satu gambar yang sama untuk semua stamp.
 * @param {Object|Object[]} options - Konfigurasi stamp. Jika array, akan melakukan multiple stamp.
 * @param {number} [options.pageIndex=0] - Index halaman (0-based).
 * @param {number} [options.x=0]         - Posisi X (satuan PDF).
 * @param {number} [options.y=0]         - Posisi Y (satuan PDF).
 * @param {number} [options.width]       - Lebar gambar. Jika kosong, pakai lebar asli.
 * @param {number} [options.height]      - Tinggi gambar. Jika kosong, pakai tinggi asli.
 *
 * @returns {Promise<Buffer>} Buffer PDF baru yang sudah ada stamp.
 */
async function stampImageOnPdf(pdfBuffer, imageBuffer, options = {}) {
    // 1. Load Dokumen PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

    // 2. Embed Image (Coba PNG, fallback ke JPG)
    let img;
    try {
        img = await pdfDoc.embedPng(imageBuffer);
    } catch (e) {
        console.warn('[STAMP] Gagal embed sebagai PNG, mencoba JPG. Error:', e.message);
        try {
            img = await pdfDoc.embedJpg(imageBuffer);
        } catch (err) {
            throw new Error('Gagal meng-embed gambar (bukan PNG atau JPG yang valid).');
        }
    }

    const pages = pdfDoc.getPages();

    // 3. Normalisasi Options menjadi Array of Tasks
    const tasks = Array.isArray(options) ? options : [options];
    
    // Default width dan height dari gambar yang di-embed
    const defaultWidth = img.width;
    const defaultHeight = img.height;

    // 4. Proses Setiap Task Stamp
    for (const opt of tasks) {
        if (!opt) continue;

        // Mendapatkan index halaman (pastikan minimal 0)
        let idx = Number(opt.pageIndex);
        if (!Number.isFinite(idx) || idx < 0) {
            idx = 0;
        }

        // Kalau index di luar range halaman, skip dan berikan warning
        if (idx >= pages.length) {
            console.warn(`[STAMP] Melewati stamp di pageIndex ${idx} karena melebihi total halaman (${pages.length}).`);
            continue;
        }

        const page = pages[idx];

        // Menentukan dimensi stamp (pakai nilai dari options, fallback ke dimensi asli gambar)
        const width = opt.width != null && Number.isFinite(Number(opt.width))
            ? Number(opt.width)
            : defaultWidth;

        const height = opt.height != null && Number.isFinite(Number(opt.height))
            ? Number(opt.height)
            : defaultHeight;
            
        // Menentukan posisi (default 0)
        const x = opt.x != null && Number.isFinite(Number(opt.x))
            ? Number(opt.x)
            : 0;
        const y = opt.y != null && Number.isFinite(Number(opt.y))
            ? Number(opt.y)
            : 0;

        // Lakukan stamping ke halaman
        page.drawImage(img, {
            x,
            y,
            width,
            height,
        });

        console.log(`[STAMP] Sukses stamp di Halaman ${idx + 1} (0-based: ${idx}) dengan WxH: ${width}x${height} di X,Y: ${x}, ${y}`);
    }

    // 5. Simpan Dokumen
    const finalPdf = await pdfDoc.save();
    return Buffer.from(finalPdf);
}

module.exports = { stampImageOnPdf };