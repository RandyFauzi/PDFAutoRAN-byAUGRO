// src/services/email.service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // sementara pakai Gmail
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendVerificationEmail({ to, link }) {
  const fromAddress = process.env.MAIL_FROM || `PDF AUTORAN <${process.env.MAIL_USER}>`;

  const mailOptions = {
    from: fromAddress,
    to,
    subject: 'Verifikasi Email Akun PDF AUTORAN',
    html: `
      <p>Halo,</p>
      <p>Terima kasih telah mendaftar di <b>PDF AUTORAN</b>.</p>
      <p>Untuk mengaktifkan akun Anda, silakan klik tautan verifikasi berikut:</p>
      <p><a href="${link}" target="_blank">${link}</a></p>
      <p>Tautan ini berlaku selama 24 jam.</p>
      <p>Jika Anda tidak merasa mendaftar di PDF AUTORAN, abaikan email ini.</p>
      <br/>
      <p>Salam,</p>
      <p><b>Tim PDF AUTORAN</b></p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendVerificationEmail,
};
