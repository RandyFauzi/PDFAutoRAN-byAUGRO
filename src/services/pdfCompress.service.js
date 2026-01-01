const { spawn } = require('child_process');

function compressPdfBuffer(inputBuffer, quality = 'medium') {
  const qualityMap = {
    ultra: '/screen',
    low: '/screen',
    medium: '/ebook',
    high: '/printer',
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

      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',

      '-sOutputFile=-',
      '-',
    ];

    // 🔥 EXTRA COMPRESSION
    if (quality === 'ultra') {
      args.push(
        '-dDownsampleColorImages=true',
        '-dDownsampleGrayImages=true',
        '-dDownsampleMonoImages=true',
        '-dColorImageResolution=72',
        '-dGrayImageResolution=72',
        '-dMonoImageResolution=72',
        '-dJPEGQ=40',
        '-dDiscardAllMetadata=true'
      );
    }

    const gs = spawn('gs', args);

    const chunks = [];
    let errText = '';

    gs.stdout.on('data', (c) => chunks.push(c));
    gs.stderr.on('data', (c) => (errText += c.toString()));

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
