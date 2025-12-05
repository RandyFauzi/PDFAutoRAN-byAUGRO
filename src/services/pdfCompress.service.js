// src/services/pdfCompress.service.js
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGsQualityFlag(quality) {
  switch ((quality || '').toLowerCase()) {
    case 'low':
      return '/screen';   // kompres paling kuat, kualitas turun
    case 'high':
      return '/printer';  // kualitas bagus, kompres ringan
    case 'medium':
    default:
      return '/ebook';    // default: seimbang
  }
}

/**
 * Jalankan Ghostscript untuk kompres PDF.
 * @param {string} inputPath path file PDF sumber
 * @param {string} quality 'low' | 'medium' | 'high'
 * @returns {Promise<Buffer>} buffer PDF terkompres
 */
function compressPdfFile(inputPath, quality = 'medium') {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(__dirname, '..', '..', 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const outputPath = path.join(tmpDir, `compressed-${randomUUID()}.pdf`);
    const pdfSettings = getGsQualityFlag(quality);

    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${pdfSettings}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    const gs = spawn('gs', args);

    gs.on('error', (err) => {
      reject(new Error(`Ghostscript gagal dijalankan: ${err.message}`));
    });

    gs.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Ghostscript exit code ${code}`));
      }

      fs.readFile(outputPath, (err, data) => {
        // bersihkan file output
        fs.unlink(outputPath, () => {});
        if (err) return reject(err);
        resolve(data);
      });
    });
  });
}

module.exports = {
  compressPdfFile,
};
