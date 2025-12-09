// src/services/email.service.js
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

// Helper untuk inisialisasi transporter sekali saja
function getTransporter() {
  if (transporter) return transporter;

  if (!env.mailUser || !env.mailPass) {
    console.warn(
      '[EmailService] MAIL_USER atau MAIL_PASS belum di-set. Email tidak akan terkirim.',
      { mailUser: env.mailUser, mailFrom: env.mailFrom }
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.mailUser,
      pass: env.mailPass,
    },
  });

  return transporter;
}

async function sendVerificationEmail({ to, link }) {
  try {
    const tx = getTransporter();
    if (!tx) {
      // sudah di-warn di getTransporter
      return;
    }

    if (!to || !link) {
      console.warn('[EmailService] to/link kosong, email tidak dikirim.', {
        to,
        link,
      });
      return;
    }

    const logoUrl = 'https://i.imgur.com/AvnGQqa.png';

    const mailOptions = {
      from: `"PDF AUTORAN" <${env.mailFrom || env.mailUser}>`,
      to,
      subject: 'Verifikasi Akun PDF AUTORAN',
      html: `
      <div style="background:#f9fafb;padding:32px 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">
          
          <div style="text-align:center;padding:24px 24px 16px;border-bottom:1px solid #e5e7eb;">
            <img src="${logoUrl}" alt="PDF AUTORAN" style="width:56px;height:56px;border-radius:16px;object-fit:cover;margin-bottom:8px;">
            <div style="font-size:18px;font-weight:600;color:#111827;">PDF AUTORAN</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">
              API Service untuk kebutuhan proses PDF Anda
            </div>
          </div>

          <div style="padding:24px 24px 20px;">
            <p style="font-size:14px;color:#111827;margin:0 0 12px;">Halo,</p>
            <p style="font-size:14px;color:#374151;margin:0 0 12px;">
              Terima kasih telah mendaftar di <strong>PDF AUTORAN</strong>.
              Sebelum mulai menggunakan layanan, silakan verifikasi alamat email Anda.
            </p>
            <p style="font-size:13px;color:#6b7280;margin:0 0 18px;">
              Tombol di bawah ini akan mengkonfirmasi bahwa email ini benar milik Anda.
            </p>

            <div style="text-align:center;margin:24px 0;">
              <a href="${link}"
                 style="display:inline-block;padding:10px 20px;background:#f97316;color:#ffffff;
                        text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;
                        box-shadow:0 10px 20px rgba(249,115,22,0.35);">
                Verifikasi Email Saya
              </a>
            </div>

            <p style="font-size:12px;color:#9ca3af;margin:0 0 8px;">
              Atau salin dan buka link berikut di browser jika tombol di atas tidak berfungsi:
            </p>
            <p style="font-size:12px;color:#2563eb;word-break:break-all;margin:0 0 16px;">
              <a href="${link}" style="color:#2563eb;text-decoration:underline;">${link}</a>
            </p>

            <p style="font-size:12px;color:#9ca3af;margin:0;">
              Jika Anda tidak pernah membuat akun PDF AUTORAN, abaikan email ini.
            </p>
          </div>

          <div style="background:#f3f4f6;padding:12px 24px;text-align:center;">
            <p style="font-size:11px;color:#9ca3af;margin:0;">
              Email ini dikirim otomatis oleh sistem PDF AUTORAN. Jangan membalas email ini.
            </p>
          </div>
        </div>
      </div>
      `,
    };

    console.log('[EmailService] Mengirim email verifikasi ke:', to);
    const info = await tx.sendMail(mailOptions);
    console.log('[EmailService] Email verifikasi terkirim. MessageId:', info.messageId);
  } catch (err) {
    console.error('[EmailService] Gagal mengirim email verifikasi:', err);
  }
}

module.exports = {
  sendVerificationEmail,
};
