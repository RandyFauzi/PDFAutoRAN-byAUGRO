const { spawn } = require('child_process');

function compressPdfBuffer(inputBuffer, quality = 'medium') {
  const qualityMap = {
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
      '-dUseCropBox',
      '-dPreserveEPSInfo=true',

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
