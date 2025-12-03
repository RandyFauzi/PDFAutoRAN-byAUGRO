// src/utils/cryptoUtil.js
const crypto = require('crypto');
s
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // bytes

function getKey() {
  const secret = process.env.API_KEY_ENCRYPT_SECRET;
  if (!secret) {
    throw new Error('API_KEY_ENCRYPT_SECRET is not set');
  }
  // pastikan 32 byte
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // gabung iv + ciphertext
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted) {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
};
