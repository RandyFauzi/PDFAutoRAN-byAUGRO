// src/controllers/usage.controller.js

const prisma = require('../config/prisma');

async function listForCurrentUser(req, res) {
  // 1. Pastikan userId ada lebih dulu
  const userIdRaw = req.user && req.user.id;

  if (!userIdRaw) {
    return res.status(401).json({ message: 'Unauthorized - no user in request' });
  }

  // Pastikan number
  const userId = Number(userIdRaw);

  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const logs = await prisma.usageLog.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    const mapped = logs.map((log) => ({
      id: log.id,
      operation: log.operation,
      credits_used: log.creditsUsed,
      created_at: log.createdAt,
    }));

    return res.json({
      data: mapped,
    });
  } catch (err) {
    console.error('[UsageController] listForCurrentUser error:', err);

    return res.status(500).json({
      message: 'Failed to fetch usage logs',
      error: err.message,        // <-- tambahkan ini untuk debug
    });
  }
}

module.exports = {
  listForCurrentUser,
};
