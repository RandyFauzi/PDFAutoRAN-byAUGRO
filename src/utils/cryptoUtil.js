// src/utils/cryptoUtil.js
// -----------------------------------------------
// Utility enkripsi / dekripsi sederhana untuk API Key
// Menggunakan AES-256-CTR dengan secret dari .env:
//   API_KEY_ENCRYPT_SECRET
// -----------------------------------------------

const crypto = require('crypto');

const RAW_SECRET = process.env.API_KEY_ENCRYPT_SECRET || 'fallback-secret';

// Pastikan panjang key 32 byte (256 bit)
const KEY = Buffer.from(
  RAW_SECRET.length >= 32
    ? RAW_SECRET.slice(0, 32)
    : RAW_SECRET.padEnd(32, '0'),
  'utf8'
);

const ALGO = 'aes-256-ctr';

/**
 * Enkripsi string -> string "ivHex:cipherHex"
 */
function encrypt(plainText) {
  if (plainText == null) return null;

  const iv = crypto.randomBytes(16); // 128-bit IV
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);

  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Dekripsi string "ivHex:cipherHex" -> plain text
 */
function decrypt(token) {
  if (!token) return null;

  const parts = String(token).split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
};
