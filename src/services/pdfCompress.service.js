const { spawn } = require('child_process');

function compressPdfBuffer(inputBuffer, quality = 'medium') {
  const qualityMap = {
    low: {
      pdf: '/screen',
      dpi: 72,
      jpegQ: 40,
    },
    medium: {
      pdf: '/ebook',
      dpi: 120,
      jpegQ: 60,
    },
    high: {
      pdf: '/printer',
      dpi: 300,
      jpegQ: 85,
    },
    ultra: {
      pdf: '/screen',
      dpi: 72,
      jpegQ: 30,
    },
  };

  const q = qualityMap[quality] || qualityMap.medium;

  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${q.pdf}`,

      // ⬇️ INI YANG PENTING
      '-dDownsampleColorImages=true',
      '-dDownsampleGrayImages=true',
      '-dDownsampleMonoImages=true',

      `-dColorImageResolution=${q.dpi}`,
      `-dGrayImageResolution=${q.dpi}`,
      `-dMonoImageResolution=${q.dpi}`,

      '-dColorImageDownsampleType=/Bicubic',
      '-dGrayImageDownsampleType=/Bicubic',
      '-dMonoImageDownsampleType=/Bicubic',

      '-dJPEGQ=' + q.jpegQ,

      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',

      '-sOutputFile=-',
      '-',
    ];

    const gs = spawn('gs', args);

    const chunks = [];
    let errText = '';

    gs.stdout.on('data', (chunk) => chunks.push(chunk));
    gs.stderr.on('data', (chunk) => (errText += chunk.toString()));

    gs.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Ghostscript error ${code}: ${errText}`));
      }
      resolve(Buffer.concat(chunks));
    });

    gs.stdin.write(inputBuffer);
    gs.stdin.end();
  });
}

module.exports = { compressPdfBuffer };
