// src/controllers/dana.controller.js
async function finishNotify(req, res) {
  try {
    console.log('[DANA Notify] body:', req.body);

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
