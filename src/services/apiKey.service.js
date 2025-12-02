const crypto = require('crypto');
const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../utils/cryptoUtil'); // pastikan file ini sudah ada

module.exports = {
  /**
   * Generate API key untuk user.
   * - Kalau user sudah punya key → UPDATE row lama (tidak nambah row baru)
   * - Kalau belum punya → CREATE baru
   * - Simpan hash + plainKeyEncrypted
   */
  async createApiKey(userId, label) {
    // 1) Generate key baru
    const rawKey = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
    const encrypted = encrypt(rawKey);

    // 2) Cek apakah user sudah punya ApiKey
    const existing = await prisma.apiKey.findFirst({
      where: { userId },
    });

    let apiKey;

    if (existing) {
      // 🔁 UPDATE row lama → tetap 1 baris per user
      apiKey = await prisma.apiKey.update({
        where: { id: existing.id },
        data: {
          label,
          keyHash: hashed,
          plainKeyEncrypted: encrypted,
          revokedAt: null,       // pastikan aktif
          createdAt: new Date(), // optional, refresh waktu
        },
      });
    } else {
      // ➕ Belum ada → buat baru
      apiKey = await prisma.apiKey.create({
        data: {
          userId,
          label,
          keyHash: hashed,
          plainKeyEncrypted: encrypted,
          revokedAt: null,
        },
      });
    }

    return { rawKey, apiKey };
  },

  /**
   * Ambil API key aktif milik user.
   * - Hanya 1 key aktif (revokedAt = null)
   * - Kembalikan dalam bentuk array (bisa 0 atau 1 item)
   * - Sudah berisi plain key (decrypted) di field `key`
   */
  async listApiKeys(userId) {
    const key = await prisma.apiKey.findFirst({
      where: {
        userId,
        revokedAt: null, // hanya aktif
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!key) {
      return [];
    }

    return [
      {
        id: key.id,
        label: key.label,
        key: key.plainKeyEncrypted ? decrypt(key.plainKeyEncrypted) : null, // ⭐ plain key untuk frontend
        createdAt: key.createdAt,
        status: key.revokedAt ? 'revoked' : 'active',
      },
    ];
  },

  /**
   * Revoke key (kalau kamu tetap mau fitur revoke manual)
   */
  async revokeKey(id, userId) {
    return prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Validasi raw API key (dipakai di middleware auth by API key)
   */
  async validateKey(rawKey) {
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');

    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash: hashed,
        revokedAt: null,
      },
      include: {
        user: true,
      },
    });

    return keyRecord;
  },
};
