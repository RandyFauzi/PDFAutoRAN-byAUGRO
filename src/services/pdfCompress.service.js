// src/services/pdfCompress.service.js
const { spawn } = require('child_process');

function compressPdfBuffer(inputBuffer, quality = 'medium') {
  const qualityMap = {
    low: '/screen',   // kompres paling kuat, kualitas rendah
    medium: '/ebook', // default: seimbang
    high: '/printer', // kualitas tinggi, kompres lebih ringan
  };

  const q = qualityMap[quality] || qualityMap.medium;

  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${q}`,
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',

      // 🔒 Penting supaya tidak nambah halaman & layout tetap:
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dUseCropBox',            // pakai cropbox agar size halaman asli dipertahankan
      '-dPreserveEPSInfo=true',  // jaga struktur halaman (header/footer dll)

      // (opsional) jaga downsampling tapi nggak wajib diubah:
      // '-dColorImageDownsampleType=/Bicubic',
      // '-dGrayImageDownsampleType=/Bicubic',
      // '-dMonoImageDownsampleType=/Subsample',

      '-sOutputFile=-', // output ke stdout
      '-',              // input dari stdin
    ];

    const gs = spawn('gs', args);

    const chunks = [];
    let errText = '';

    gs.stdout.on('data', (chunk) => chunks.push(chunk));
    gs.stderr.on('data', (chunk) => {
      errText += chunk.toString();
    });

    gs.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Ghostscript exit code ${code}: ${errText}`));
      }
      return resolve(Buffer.concat(chunks));
    });

    gs.stdin.write(inputBuffer);
    gs.stdin.end();
  });
}

module.exports = {
  compressPdfBuffer,
};
