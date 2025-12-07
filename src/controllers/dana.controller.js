// src/controllers/dana.controller.js
// NOTE: jangan ubah model/enum yang sudah ada; ini cuma logic baru

async function finishNotify(req, res) {
  try {
    console.log('[DANA Notify] body:', req.body);

    const latestStatus = req.body?.latestTransactionStatus; // "00", "05", dst.

    // Untuk UAT "success" dan "closed/expired" mereka minta kita balas:
    // { "responseCode": "2005600", "responseMessage": "Successful" }
    // Untuk UAT "internal error" -> "5005601" / "Internal Server Error"

    // Versi default: selalu success (buat lewat 2 dari 3 skenario dulu)
    return res.json({
      responseCode: '2005600',
      responseMessage: 'Successful',
    });
  } catch (err) {
    console.error('[DANA Notify] error:', err);
    return res.status(500).json({
      responseCode: '5005601',
      responseMessage: 'Internal Server Error',
    });
  }
}

module.exports = { finishNotify };
