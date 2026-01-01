// src/services/pdfCompress.service.js
const { spawn } = require('child_process');

/**
 * Compress PDF Buffer using Ghostscript (AGGRESSIVE IMAGE COMPRESSION)
 *
 * quality:
 * - low     -> readable, ringan
 * - medium  -> standar PDF.co
 * - ultra   -> maksimum kompres (scan-heavy)
 */
function compressPdfBuffer(inputBuffer, quality = 'medium') {
  const qualityMap = {
    low: {
      colorDpi: 96,
      grayDpi: 96,
      jpegQ: 60,
    },
    medium: {
      colorDpi: 72,
      grayDpi: 72,
      jpegQ: 40,
    },
    ultra: {
      colorDpi: 50,
      grayDpi: 50,
      jpegQ: 30,
    },
  };

  const q = qualityMap[quality] || qualityMap.medium;

  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',

      // =============================
      // FORCE IMAGE DOWNSAMPLING
      // =============================
      '-dDownsampleColorImages=true',
      '-dDownsampleGrayImages=true',
      '-dDownsampleMonoImages=true',

      '-dColorImageDownsampleType=/Bicubic',
      '-dGrayImageDownsampleType=/Bicubic',
      '-dMonoImageDownsampleType=/Subsample',

      `-dColorImageResolution=${q.colorDpi}`,
      `-dGrayImageResolution=${q.grayDpi}`,
      '-dMonoImageResolution=300',

      // =============================
      // JPEG RECOMPRESS
      // =============================
      `-dJPEGQ=${q.jpegQ}`,

      // =============================
      // EXTRA OPTIMIZATION
      // =============================
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dSubsetFonts=true',
      '-dEmbedAllFonts=true',

      // =============================
      // SAFETY FLAGS
      // =============================
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',

      // =============================
      // STDIN -> STDOUT
      // =============================
      '-sOutputFile=-',
      '-',
    ];

    console.log('[PDF_COMPRESS] Quality:', quality);
    console.log('[PDF_COMPRESS] DPI:', q.colorDpi, 'JPEGQ:', q.jpegQ);

    const gs = spawn('gs', args);

    const chunks = [];
    let errText = '';

    gs.stdout.on('data', (chunk) => chunks.push(chunk));
    gs.stderr.on('data', (chunk) => (errText += chunk.toString()));

    gs.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Ghostscript error ${code}: ${errText || 'unknown error'}`)
        );
      }

      const output = Buffer.concat(chunks);

      if (!output.length) {
        return reject(new Error('Ghostscript menghasilkan output kosong'));
      }

      resolve(output);
    });

    gs.stdin.write(inputBuffer);
    gs.stdin.end();
  });
}

module.exports = {
  compressPdfBuffer,
};