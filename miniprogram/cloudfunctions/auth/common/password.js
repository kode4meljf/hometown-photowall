const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
const BCRYPT_PREFIX = /^\$2[aby]\$/;

function isPasswordHash(stored) {
  return typeof stored === 'string' && BCRYPT_PREFIX.test(stored);
}

async function hashPassword(plain) {
  if (!plain || typeof plain !== 'string') {
    throw new Error('invalid password');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  if (isPasswordHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

function needsPasswordUpgrade(stored) {
  return !!stored && !isPasswordHash(stored);
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsPasswordUpgrade,
  isPasswordHash,
};
