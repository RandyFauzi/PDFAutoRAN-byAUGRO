const jwt = require('jsonwebtoken');
const env = require('../config/env');
const userService = require('../services/user.service');
const { applyFreePlan } = require('../services/subscription.service');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../services/email.service');

// Helper untuk membuat JWT
function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
  };

  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

// ========================================
// POST /api/v1/auth/register
// ========================================
async function register(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email dan password wajib diisi.' });
    }

    // Cek email sudah ada?
    const existing = await userService.findUserByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ message: 'Email sudah terdaftar.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Buat user baru — credits selalu mulai dari 0
    // isVerified akan default false dari schema Prisma
    const newUser = await userService.createUser(email, passwordHash);

    // Terapkan FREE plan → apply initialCredits sekali saja
    const userWithFreePlan = await applyFreePlan(newUser.id);

    // 🔹 Generate token verifikasi unik
    const verificationToken = crypto.randomUUID(); // atau crypto.randomBytes(32).toString('hex')

    // 🔹 Simpan token di tabel EmailVerificationToken
    await prisma.emailVerificationToken.create({
      data: {
        userId: userWithFreePlan.id,
        token: verificationToken,
        // contoh: masa berlaku 24 jam
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    // 🔹 Susun link verifikasi (ini URL ke frontend kamu)
    const verifyLink = `https://pdfautoran.com/verify-email?token=${verificationToken}`;

    // 🔹 Kirim email verifikasi
    await sendVerificationEmail({
      to: userWithFreePlan.email,
      link: verifyLink,
    });

    // Buat token JWT seperti biasa (walau user belum verifikasi)
    const token = signToken(userWithFreePlan);

    return res.status(201).json({
      message: 'Registrasi berhasil.',
      data: {
        id: userWithFreePlan.id,
        email: userWithFreePlan.email,
        credits: userWithFreePlan.credits,
        plan: userWithFreePlan.plan,
        token,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res
      .status(500)
      .json({ message: 'Terjadi kesalahan pada server.' });
  }
}


// ========================================
// POST /api/v1/auth/login
// ========================================
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email dan password wajib diisi.' });
    }

    const user = await userService.findUserByEmail(email);

    if (!user) {
      return res
        .status(401)
        .json({ message: 'Email atau password salah.' });
    }

    // Cocokkan password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: 'Email atau password salah.' });
    }

    // 🔹 Tambahan: blokir kalau email belum terverifikasi
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: 'Email Anda belum terverifikasi. Silakan cek email Anda.' });
    }

    // Buat token
    const token = signToken(user);

    return res.json({
      message: 'Login berhasil.',
      data: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        credits: user.credits,
        token,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json({ message: 'Terjadi kesalahan pada server.' });
  }
}

// ========================================
// GET /api/v1/auth/verify-email?token=...
// ========================================
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res
        .status(400)
        .json({ message: 'Token verifikasi diperlukan.' });
    }

    // Cari token di tabel EmailVerificationToken
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: {
        user: true,
      },
    });

    if (!record) {
      return res
        .status(400)
        .json({ message: 'Token verifikasi tidak valid atau sudah kedaluwarsa.' });
    }

    // Cek kadaluarsa
    if (record.expiresAt < new Date()) {
      // Optional: hapus token yang kadaluarsa
      await prisma.emailVerificationToken.delete({
        where: { id: record.id },
      });

      return res
        .status(400)
        .json({ message: 'Token verifikasi sudah kedaluwarsa.' });
    }

    // Kalau user sudah terverifikasi sebelumnya
    if (record.user && record.user.isVerified) {
      // Optional: hapus token karena sudah tidak diperlukan
      await prisma.emailVerificationToken.delete({
        where: { id: record.id },
      });

      return res.json({
        message: 'Email sudah terverifikasi sebelumnya. Silakan login.',
      });
    }

    // Update user → set isVerified = true
    await prisma.user.update({
      where: { id: record.userId },
      data: { isVerified: true },
    });

    // Hapus token agar tidak bisa dipakai lagi
    await prisma.emailVerificationToken.delete({
      where: { id: record.id },
    });

    // Untuk sekarang kita kirim JSON saja dulu
    // Nanti Laravel bisa panggil endpoint ini dari route /verify-email
    return res.json({
      message: 'Email berhasil diverifikasi. Silakan login.',
    });
  } catch (err) {
    console.error('Verify email error:', err);
    return res
      .status(500)
      .json({ message: 'Terjadi kesalahan pada server.' });
  }
}


// ========================================
// GET /api/v1/auth/me
// ========================================
async function me(req, res) {
  try {
    return res.json({
      message: 'Profil user.',
      data: {
        id: req.user.id,
        email: req.user.email,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    return res
      .status(500)
      .json({ message: 'Terjadi kesalahan pada server.' });
  }
}

async function changePassword(req, res) {
  try {
    const userId = req.user && req.user.id; // dari authMiddleware (JWT)
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword & newPassword required' });
    }

    // 1) Ambil user dari DB
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // 2) Cek password lama
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password saat ini tidak sesuai' });
    }

    // 3) Hash password baru
    const hashed = await bcrypt.hash(newPassword, 10);

    // 4) Update ke DB
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        // optional:
        // passwordUpdatedAt: new Date(),
      },
    });

    return res.json({ message: 'Password berhasil diperbarui' });
  } catch (err) {
    console.error('[AuthController] changePassword error:', err);
    return res.status(500).json({ message: 'Gagal mengubah password' });
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  me,
  changePassword,
};
