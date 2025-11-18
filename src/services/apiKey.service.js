const crypto = require('crypto');
const prisma = require('../config/prisma');

module.exports = {
  async createApiKey(userId, label) {
    const rawKey = crypto.randomBytes(32).toString('hex');  
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        label,
        keyHash: hashed
      }
    });

    return { rawKey, apiKey };
  },

  async listApiKeys(userId) {
    return prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  },

  async revokeKey(id, userId) {
    return prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  },

  async validateKey(rawKey) {
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');

    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash: hashed,
        revokedAt: null
      },
      include: {
        user: true
      }
    });

    return keyRecord;
  }
};
