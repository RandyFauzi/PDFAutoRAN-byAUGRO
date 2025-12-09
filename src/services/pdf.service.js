async function stampPdf(req, res) {
  try {
    const userId = req.user.id;

    const {
      pdfUrl,
      imageUrl,
      page,
      pages,   // <--- string "1,2" dari client
      x,
      y,
      width,
      height,
      fileName,
      stamps,  // <--- mode advanced kalau mau array manual
    } = req.body;

    if (!pdfUrl || !imageUrl) {
      return res.status(400).json({
        message: 'Field "pdfUrl" dan "imageUrl" wajib diisi.',
      });
    }

    // Download PDF + Gambar
    const pdfBuffer = await downloadAsBuffer(String(pdfUrl).trim(), 'pdf');
    const imageBuffer = await downloadAsBuffer(String(imageUrl).trim(), 'image');

    let options;

    // =====================================================
    // 1) MODE ADVANCED: client kirim stamps[] sendiri
    //    [
    //      { page: 1, x: 100, y: 200, width: 80, height: 30 },
    //      { page: 3, x: 120, y: 210 }
    //    ]
    // =====================================================
    if (Array.isArray(stamps) && stamps.length > 0) {
      options = stamps.map((s, idx) => {
        if (!s.page) {
          throw new Error(`Stamp #${idx} missing 'page'`);
        }
        return {
          pageIndex: Number(s.page) - 1,
          x: s.x != null ? Number(s.x) : Number(x || 0),
          y: s.y != null ? Number(s.y) : Number(y || 0),
          width: s.width != null ? Number(s.width) : (width != null ? Number(width) : undefined),
          height: s.height != null ? Number(s.height) : (height != null ? Number(height) : undefined),
        };
      });
    }

    // =====================================================
    // 2) MODE SIMPLE: pages = "1,2" → stamp di >1 halaman
    // =====================================================
    else if (pages) {
      const pageNumbers = parsePagesToArray(pages);  // [1,2,...]

      if (!pageNumbers.length) {
        return res.status(400).json({
          message: 'Field "pages" tidak valid. Contoh: "1,2" atau "2,3".',
        });
      }

      options = pageNumbers.map((p) => ({
        pageIndex: p - 1,
        x: Number(x || 0),
        y: Number(y || 0),
        width: width != null ? Number(width) : undefined,
        height: height != null ? Number(height) : undefined,
      }));
    }

    // =====================================================
    // 3) MODE LEGACY: hanya 1 page (pakai field "page")
    // =====================================================
    else {
      options = {
        pageIndex: Number(page || 1) - 1,
        x: Number(x || 0),
        y: Number(y || 0),
        width: width != null ? Number(width) : undefined,
        height: height != null ? Number(height) : undefined,
      };
    }

    // Proses stamping
    const stampedRaw = await pdfService.stampImageOnPdf(
      pdfBuffer,
      imageBuffer,
      options,
    );

    const stamped = Buffer.isBuffer(stampedRaw)
      ? stampedRaw
      : Buffer.from(stampedRaw);

    const safeName =
      (fileName && String(fileName).trim()) || 'stamped-document';
    const sanitizedName = safeName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedName}.pdf"`,
    );
    res.setHeader('Content-Length', stamped.length);

    return res.end(stamped);
  } catch (err) {
    console.error('Error stampPdf:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat stamp PNG ke PDF.',
      detail: err.message,
    });
  }
}
